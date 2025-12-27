// src/pages/BcSalesFyTablePage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API_BASE_URL = `${window.location.origin}/api`;

type FyTableResponse = {
  meta?: any;
  table?: {
    columns: string[]; // e.g. ["FY24","FY25","FY26"]
    rows: Array<{ fq: string; month: string; [fy: string]: number | string }>;
    totals: Record<string, number>;
    debug?: any;
  };
};

function safeString(v: any) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return String(v);
  } catch {
    return "";
  }
}

function fmtMoneySigned(n: any) {
  const x = Number(n || 0);
  if (!isFinite(x)) return "0";
  const abs = Math.abs(x).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return x < 0 ? `-${abs}` : abs;
}

function matchesSearchAny(obj: any, qRaw: string) {
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;
  for (const v of Object.values(obj || {})) {
    if (safeString(v).toLowerCase().includes(q)) return true;
  }
  return false;
}

function buildQs(params: Record<string, any>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    qs.set(k, s);
  }
  return qs;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "GET", signal });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 600)}`);
  }
  return (await res.json()) as T;
}

async function downloadBlob(url: string, filename: string) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 600)}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export default function BcSalesFyTablePage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<FyTableResponse | null>(null);

  // Keep your existing defaults (simple, like Odoo page)
  const service = "SalesDashboard";
  const fy = "FY24,FY25,FY26";
  const source: "all" | "bc" | "odoo" = "all";
  const includeOdoo = true;
  const excludeIntercompany = false;

  // UI controls (Odoo-like)
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(1);

  const abortRef = useRef<AbortController | null>(null);

  const requestUrl = useMemo(() => {
    const qs = buildQs({
      service,
      fy,
      source,
      includeOdoo: String(includeOdoo),
      excludeIntercompany: String(excludeIntercompany),
    });
    return `${API_BASE_URL}/sd/fy-table?${qs.toString()}`;
  }, []);

  const xlsxUrl = useMemo(() => {
    const qs = buildQs({
      service,
      fy,
      source,
      includeOdoo: String(includeOdoo),
      excludeIntercompany: String(excludeIntercompany),
    });
    return `${API_BASE_URL}/sd/fy-table.xlsx?${qs.toString()}`;
  }, []);

  async function load() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setErr(null);

    try {
      const json = await fetchJson<FyTableResponse>(requestUrl, ac.signal);
      setData(json);
      setPage(1);
    } catch (e: any) {
      if (String(e?.name || "").toLowerCase() === "aborterror") return;
      setErr(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const table = data?.table;
  const fyCols = useMemo(() => table?.columns || [], [table?.columns]);
  const fyRows = useMemo(() => table?.rows || [], [table?.rows]);
  const totals = useMemo(() => table?.totals || {}, [table?.totals]);

  const filtered = useMemo(() => {
    const rows = Array.isArray(fyRows) ? fyRows : [];
    if (!search.trim()) return rows;
    return rows.filter((r) => matchesSearchAny(r, search));
  }, [fyRows, search]);

  const totalPages = useMemo(() => {
    if (pageSize === -1) return 1;
    return Math.max(1, Math.ceil(filtered.length / Math.max(1, pageSize)));
  }, [filtered.length, pageSize]);

  const pageSafe = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (page !== pageSafe) setPage(pageSafe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSafe]);

  const paged = useMemo(() => {
    if (pageSize === -1) return filtered;
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe, pageSize]);

  async function onExportXlsx() {
    const dateTag = new Date().toISOString().slice(0, 10);
    try {
      await downloadBlob(xlsxUrl, `fy-table-${dateTag}.xlsx`);
    } catch {
      // fallback: /fy-table?format=xlsx
      const qs = buildQs({
        service,
        fy,
        source,
        includeOdoo: String(includeOdoo),
        excludeIntercompany: String(excludeIntercompany),
        format: "xlsx",
      });
      await downloadBlob(
        `${API_BASE_URL}/sd/fy-table?${qs.toString()}`,
        `fy-table-${dateTag}.xlsx`
      );
    }
  }

  // totals sum (optional footer)
  const totalAll = useMemo(() => {
    const xs = Object.values(totals || {}).map((x) => Number(x || 0));
    return xs.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
  }, [totals]);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4">
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl">
                Business Central — All Entries
              </CardTitle>
              <div className="text-sm text-muted-foreground">
                Source: <span className="font-mono">/api/sd/fy-table</span>
                <span className="mx-2">•</span>
                FYs: <Badge variant="secondary">{fy}</Badge>
                <span className="mx-2">•</span>
                Service: <Badge variant="secondary">{service}</Badge>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={load} disabled={loading}>
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={onExportXlsx}
                disabled={loading || !fyRows.length}
              >
                Export XLSX
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : err ? (
              <div className="rounded-xl border p-3 text-sm">
                <div className="font-semibold text-red-600">Failed to load</div>
                <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {err}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  URL: <span className="font-mono break-all">{requestUrl}</span>
                </div>
              </div>
            ) : (
              <>
                {/* Top controls like Odoo */}
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex-1">
                    <Input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Search across all columns..."
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

                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pageSafe <= 1}
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
                      disabled={pageSafe >= totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>

                {/* Table */}
                <div className="rounded-2xl border overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead className="whitespace-nowrap">FQ</TableHead>
                        <TableHead className="whitespace-nowrap">
                          Month
                        </TableHead>
                        {fyCols.map((c) => (
                          <TableHead
                            key={c}
                            className="whitespace-nowrap text-right"
                          >
                            {c}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {paged.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={2 + Math.max(1, fyCols.length)}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            No rows match your search.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paged.map((r, idx) => (
                          <TableRow key={`${r.fq}-${r.month}-${idx}`}>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant="secondary">
                                {safeString(r.fq)}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {safeString(r.month)}
                            </TableCell>
                            {fyCols.map((c) => (
                              <TableCell
                                key={`${idx}-${c}`}
                                className="whitespace-nowrap text-right tabular-nums"
                              >
                                {fmtMoneySigned(r[c])}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Totals (small footer) */}
                <div className="rounded-2xl border p-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="text-sm text-muted-foreground mr-1">
                      Totals:
                    </div>
                    {fyCols.map((c) => (
                      <Badge
                        key={c}
                        variant="secondary"
                        className="tabular-nums"
                      >
                        {c}: {fmtMoneySigned(totals?.[c] ?? 0)}
                      </Badge>
                    ))}
                    <Badge variant="secondary" className="tabular-nums">
                      All: {fmtMoneySigned(totalAll)}
                    </Badge>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="text-[11px] text-muted-foreground text-right">
          All values are read-only exports.
        </div>
      </div>
    </Layout>
  );
}
