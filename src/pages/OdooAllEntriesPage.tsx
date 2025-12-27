import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Filter } from "lucide-react";
import Layout from "@/components/Layout";

const API_BASE_URL = `https://threeakchemie.onrender.com/api`;

type AnyRow = Record<string, any>;
const HIDE_COLUMNS = new Set([
  "Master Category",
  "Category",
  "Sub Category",
  "Product Base Name",
  "Mapped Name",
]);

type ColFilterState = {
  // if set is empty => treat as "all selected"
  selected: Set<string>;
  search: string;
};

function normCell(v: any) {
  const s = safeString(v).trim();
  return s === "" ? "(blank)" : s;
}

function safeString(v: any) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return String(v);
  } catch {
    return "";
  }
}
const fmtINR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function renderCell(col: string, value: any) {
  const key = col.trim().toLowerCase();

  if (key === "amount (inr)") {
    // IMPORTANT: XLSX blanks come in as "" and Number("") === 0 → shows ₹0.00
    if (value == null) return "";
    if (typeof value === "string" && value.trim() === "") return "";

    // Handle numbers or numeric strings safely
    const n =
      typeof value === "number"
        ? value
        : Number(String(value).replace(/,/g, "").trim());

    if (Number.isFinite(n)) return fmtINR.format(n);
    return safeString(value);
  }

  return safeString(value);
}

function pickSheetName(sheetNames: string[]) {
  // Prefer "Odoo Rows" if present
  const preferred = sheetNames.find((n) =>
    n.toLowerCase().includes("odoo rows")
  );
  if (preferred) return preferred;

  // Otherwise any sheet containing "odoo"
  const anyOdoo = sheetNames.find((n) => n.toLowerCase().includes("odoo"));
  if (anyOdoo) return anyOdoo;

  // Fallback: first sheet
  return sheetNames[0];
}
function pickKeyCI(sample: AnyRow, candidates: string[]) {
    if (!sample) return null;
    const keys = Object.keys(sample);
    const m = new Map(keys.map((k) => [k.toLowerCase(), k]));
    for (const c of candidates) {
      const hit = m.get(String(c).toLowerCase());
      if (hit) return hit;
    }
    return null;
  }
  
  function isInrText(v: any) {
    const s = safeString(v).trim().toUpperCase();
    if (!s) return false;
    return (
      s === "INR" ||
      s.includes("INR") ||
      (s.includes("INDIAN") && s.includes("RUPEE")) ||
      s.includes("RUPEE") ||
      s.includes("₹")
    );
  }
  
  function toNum(v: any): number | null {
    if (v == null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const s = safeString(v).trim();
    if (!s) return null;
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  
function rowMatchesSearch(row: AnyRow, qRaw: string) {
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;

  // Search across all cell values (stringified)
  for (const v of Object.values(row)) {
    const s = safeString(v).toLowerCase();
    if (s.includes(q)) return true;
  }
  return false;
}

export default function OdooAllEntriesPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<AnyRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [colFilters, setColFilters] = useState<Record<string, ColFilterState>>(
    {}
  );

  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(1);

  // You can change the defaults if you want a narrower range
  const from = "1970-01-01";
  const to = "2099-12-31";

  const downloadUrl = useMemo(() => {
    // Uses your existing endpoint
    return `${API_BASE_URL}/sd/odoo-rows.xlsx?from=${encodeURIComponent(
      from
    )}&to=${encodeURIComponent(to)}`;
  }, []);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(downloadUrl, { method: "GET" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 400)}`);
      }

      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = pickSheetName(wb.SheetNames);
      const ws = wb.Sheets[sheetName];
      if (!ws)
        throw new Error(
          `No worksheet found. Sheets: ${wb.SheetNames.join(", ")}`
        );

        const raw = XLSX.utils.sheet_to_json<AnyRow>(ws, { defval: "" });

        /**
         * Fill "Amount (INR)" ourselves:
         * - If Company Currency is INR: use Amount (Company)
         * - Else if Doc Currency is INR: use Amount (Doc)
         * - Else keep blank
         */
        let json = raw;
        
        if (raw.length) {
          const sample = raw[0] || {};
        
          const kCompanyCur = pickKeyCI(sample, ["Company Currency", "company_currency"]);
          const kDocCur = pickKeyCI(sample, ["Doc Currency", "doc_currency"]);
        
          const kAmtCompany = pickKeyCI(sample, ["Amount (Company)", "amount_company"]);
          const kAmtDoc = pickKeyCI(sample, ["Amount (Doc)", "amount_doc"]);
        
          // IMPORTANT: your sheet header is "Amount (INR)" — match it
          const kAmtInr =
            pickKeyCI(sample, ["Amount (INR)", "amount_inr"]) || "Amount (INR)";
        
          json = raw.map((r) => {
            const existing = r[kAmtInr];
        
            // if already populated with a real number, keep it
            const existingNum = toNum(existing);
            if (existingNum != null) return r;
        
            const companyCur = kCompanyCur ? r[kCompanyCur] : "";
            const docCur = kDocCur ? r[kDocCur] : "";
        
            let computed: number | null = null;
        
            if (isInrText(companyCur)) {
              computed = kAmtCompany ? toNum(r[kAmtCompany]) : null;
            } else if (isInrText(docCur)) {
              computed = kAmtDoc ? toNum(r[kAmtDoc]) : null;
            }
        
            return {
              ...r,
              [kAmtInr]: computed == null ? "" : computed, // keep blank if not computable
            };
          });
        }
        
      if (!json.length) {
        setRows([]);
        setColumns([]);
        setColFilters({});
        setPage(1);
        return;
      }

      const colSet = new Set<string>();
      for (const r of json) Object.keys(r || {}).forEach((k) => colSet.add(k));

      const cols = Array.from(colSet)
        .filter(Boolean)
        .filter((c) => !HIDE_COLUMNS.has(c));

      setRows(Array.isArray(json) ? json : []);
      setColumns(cols);
      setColFilters((prev) => {
        const next: Record<string, ColFilterState> = { ...prev };
        for (const c of cols) {
          if (!next[c]) next[c] = { selected: new Set<string>(), search: "" };
        }
        // remove filters for deleted columns
        Object.keys(next).forEach((k) => {
          if (!cols.includes(k)) delete next[k];
        });
        return next;
      });

      setPage(1);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const uniqueValuesByCol = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of columns) out[c] = [];

    // Build uniques with a safety cap to avoid UI freezing on huge datasets.
    const caps: Record<string, number> = {};
    const sets: Record<string, Set<string>> = {};
    for (const c of columns) {
      sets[c] = new Set();
      caps[c] = 20000; // keep high; still prevents worst-case lockups
    }

    for (const r of rows) {
      for (const c of columns) {
        const s = normCell(r[c]);
        const st = sets[c];
        if (st.size >= caps[c]) continue;
        st.add(s);
      }
    }

    for (const c of columns) {
      out[c] = Array.from(sets[c]).sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [rows, columns]);

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      // 1) global search
      if (!rowMatchesSearch(r, search)) return false;

      // 2) per-column filters
      for (const c of columns) {
        const st = colFilters[c];
        if (!st) continue;

        // if selected is empty => "all"
        if (st.selected && st.selected.size > 0) {
          const v = normCell(r[c]);
          if (!st.selected.has(v)) return false;
        }
      }

      return true;
    });

    return out;
  }, [rows, search, columns, colFilters]);

  const totalPages = useMemo(() => {
    if (pageSize === -1) return 1;
    return Math.max(1, Math.ceil(filtered.length / pageSize));
  }, [filtered.length, pageSize]);

  const pageSafe = Math.min(Math.max(1, page), totalPages);

  const paged = useMemo(() => {
    if (pageSize === -1) return filtered; // ALL
    const start = (pageSafe - 1) * pageSize;
    const end = start + pageSize;
    return filtered.slice(start, end);
  }, [filtered, pageSafe, pageSize]);

  useEffect(() => {
    // if filtering shrinks total pages, clamp current page
    if (page !== pageSafe) setPage(pageSafe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSafe]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Layout
        className="bg-gradient-to-br from-slate-50 to-slate-100"
        containerClassName="max-w-none px-0 py-0"
      >
        {/* Full width container like Index.tsx */}
        <div className="w-full px-4 md:px-6 lg:px-8 py-8">
          <div className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-xl">
                    Odoo — All Entries (Raw)
                  </CardTitle>
                  <div className="text-sm text-muted-foreground">
                    Source:{" "}
                    <span className="font-mono">/api/sd/odoo-rows.xlsx</span> •
                    Range: <Badge variant="secondary">{from}</Badge> →{" "}
                    <Badge variant="secondary">{to}</Badge>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={load} disabled={loading}>
                    Refresh
                  </Button>
                  <Button
                    onClick={() =>
                      window.open(downloadUrl, "_blank", "noopener,noreferrer")
                    }
                    variant="default"
                  >
                    Download XLSX
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex-1">
                    <Input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Search across all columns (customer, invoice, SKU, currency, amount...)"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      Rows: <Badge variant="secondary">{filtered.length}</Badge>
                    </div>

                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => {
                        setPageSize(Number(v));
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Page size" />
                      </SelectTrigger>
                      <SelectContent>
                        {[25, 50, 100, 250, 500, -1].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n === -1 ? "All rows" : `${n} / page`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={loading || pageSafe <= 1}
                      >
                        Prev
                      </Button>
                      <div className="text-sm tabular-nums">
                        Page <Badge variant="secondary">{pageSafe}</Badge> /{" "}
                        <Badge variant="secondary">{totalPages}</Badge>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={loading || pageSafe >= totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>

                {err ? (
                  <div className="rounded-xl border p-3 text-sm">
                    <div className="font-semibold text-red-600">
                      Failed to load Odoo XLSX
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {err}
                    </div>
                  </div>
                ) : null}

                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-64 w-full" />
                  </div>
                ) : (
                  <div className="rounded-2xl border overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-background">
                        <TableRow>
                          {columns.map((c) => (
                            <TableHead key={c} className="whitespace-nowrap">
                              {/* (your existing filter popover header content stays unchanged here) */}
                              <div className="flex items-center gap-2">
                                <span>{c}</span>

                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                    >
                                      <Filter className="h-4 w-4" />
                                    </Button>
                                  </PopoverTrigger>

                                  <PopoverContent
                                    align="start"
                                    className="w-[320px] p-3"
                                  >
                                    {/* (your existing popover content stays unchanged) */}
                                    <div className="space-y-2">
                                      <div className="text-sm font-semibold">
                                        {c}
                                      </div>

                                      <Input
                                        value={colFilters[c]?.search || ""}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setColFilters((prev) => ({
                                            ...prev,
                                            [c]: {
                                              ...(prev[c] || {
                                                selected: new Set(),
                                                search: "",
                                              }),
                                              search: v,
                                            },
                                          }));
                                        }}
                                        placeholder="Search values..."
                                      />

                                      <div className="flex items-center justify-between gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            const all =
                                              uniqueValuesByCol[c] || [];
                                            const q = (
                                              colFilters[c]?.search || ""
                                            )
                                              .trim()
                                              .toLowerCase();
                                            const visible = q
                                              ? all.filter((x) =>
                                                  x.toLowerCase().includes(q)
                                                )
                                              : all;

                                            setColFilters((prev) => ({
                                              ...prev,
                                              [c]: {
                                                search: prev[c]?.search || "",
                                                selected: new Set(visible),
                                              },
                                            }));
                                          }}
                                        >
                                          Select all
                                        </Button>

                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            setColFilters((prev) => ({
                                              ...prev,
                                              [c]: {
                                                search: prev[c]?.search || "",
                                                selected: new Set(),
                                              },
                                            }));
                                          }}
                                        >
                                          Clear
                                        </Button>
                                      </div>

                                      <ScrollArea className="h-[220px] rounded-md border p-2">
                                        <div className="space-y-1">
                                          {(uniqueValuesByCol[c] || [])
                                            .filter((x) => {
                                              const q = (
                                                colFilters[c]?.search || ""
                                              )
                                                .trim()
                                                .toLowerCase();
                                              return (
                                                !q ||
                                                x.toLowerCase().includes(q)
                                              );
                                            })
                                            .map((val) => {
                                              const st = colFilters[c];
                                              const selected = st?.selected
                                                ?.size
                                                ? st.selected.has(val)
                                                : true;

                                              return (
                                                <label
                                                  key={val}
                                                  className="flex items-center gap-2 text-sm cursor-pointer"
                                                >
                                                  <Checkbox
                                                    checked={selected}
                                                    onCheckedChange={(
                                                      checked
                                                    ) => {
                                                      setColFilters((prev) => {
                                                        const cur = prev[c] || {
                                                          selected:
                                                            new Set<string>(),
                                                          search: "",
                                                        };
                                                        const nextSel = new Set(
                                                          cur.selected
                                                        );

                                                        if (
                                                          nextSel.size === 0
                                                        ) {
                                                          for (const x of uniqueValuesByCol[
                                                            c
                                                          ] || [])
                                                            nextSel.add(x);
                                                        }

                                                        if (checked)
                                                          nextSel.add(val);
                                                        else
                                                          nextSel.delete(val);

                                                        return {
                                                          ...prev,
                                                          [c]: {
                                                            ...cur,
                                                            selected: nextSel,
                                                          },
                                                        };
                                                      });
                                                    }}
                                                  />
                                                  <span
                                                    className="truncate"
                                                    title={val}
                                                  >
                                                    {val}
                                                  </span>
                                                </label>
                                              );
                                            })}
                                        </div>
                                      </ScrollArea>

                                      <div className="text-xs text-muted-foreground">
                                        Tip: empty selection = “All values”
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {paged.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={Math.max(1, columns.length)}
                              className="py-8 text-center text-sm text-muted-foreground"
                            >
                              No rows match your search.
                            </TableCell>
                          </TableRow>
                        ) : (
                          paged.map((r, idx) => (
                            <TableRow key={idx}>
                              {columns.map((c) => (
                                <TableCell
                                  key={c}
                                  className="whitespace-nowrap"
                                >
                                  {renderCell(c, r[c])}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Footer note like Index.tsx */}
            <div className="text-[11px] text-muted-foreground text-right mt-4">
              All values are read-only exports.
            </div>
          </div>
        </div>
      </Layout>
    </div>
  );
}
