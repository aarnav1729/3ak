import React, { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, RefreshCcw, AlertTriangle, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type FyLabel = "FY24" | "FY25" | "FY26";

type FyRow = {
  fq: "FQ1" | "FQ2" | "FQ3" | "FQ4";
  month: string; // Apr..Mar
  [k: string]: string | number;
};

type GroupRow = { key: string; amount: number; count: number };

type FyTablePayload = {
  meta: {
    company: string;
    environment: string;
    fetchedAt: string;
    serviceName: string;
    fyLabels: string[];
    includeEntryTypes: string[];
    excludeIntercompany: boolean;
    intercompanyGroupCompanyCount: number;
    intercompanyGroupCompanies?: string[];
    appliedFilters?: {
      customerContains?: string;
      descriptionContains?: string;
      categoryContains?: string;
    };
    odoo?: { enabled: boolean; ok: boolean; rowCount: number; error?: string };
  };
  table: {
    columns: string[];
    rows: FyRow[];
    totals: Record<string, number>;
    groups?: {
      byCustomer?: GroupRow[];
      byDescription?: GroupRow[];
      byCompany?: GroupRow[];

      byCategory?: GroupRow[];
      byMasterCategory?: GroupRow[];
      bySubCategory?: GroupRow[];
      byProductBaseName?: GroupRow[];
    };
    debug?: {
      rowCount?: number;
      usedRowCount?: number;
      skippedIntercompany?: number;
      skippedWrongType?: number;
      skippedBadDate?: number;
      skippedNotInFy?: number;
      skippedCustomerFilter?: number;
      skippedDescriptionFilter?: number;
      skippedCategoryFilter?: number;
      unmappedSkuCount?: number;
    };
  };
};

const DEFAULT_FY: FyLabel[] = ["FY24", "FY25", "FY26"];

// Configure base URL (works both locally + behind proxy)
//const SD_API_BASE =
//(import.meta as any).env?.VITE_SD_API_BASE_URL?.toString() ||
//"https://threeak.onrender.com";

const SD_API_BASE =
  (import.meta as any).env?.VITE_SD_API_BASE_URL?.toString() ||
  "https://threeakchemie.onrender.com";

function fmtNumber(x: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(x || 0));
}
function companyToCountry(input: string) {
  const raw = String(input || "").trim();
  const key = raw.toUpperCase();

  // ✅ Hardcoded mapping for Odoo company labels
  const MAP: Record<string, string> = {
    "3AK CHEMIE (THAILAND) CO., LTD.": "Thailand",
    "3AK CHEMIE AUSTRALIA PTY LTD": "Australia",
    "3AK CHEMIE HONG KONG LIMITED": "Hong Kong",
    "3AK CHEMIE KENYA LIMITED": "Kenya",
    "3AK CHEMIE MALAYSIA SDN BHD": "Malaysia",
    "3AK CHEMIE SINGAPORE PTE. LTD.": "Singapore",
    "3AK CHEMIE VIETNAM COMPANY LIMITED": "Vietnam",
  };

  // Try exact match first
  if (MAP[key]) return MAP[key];

  // Small normalization for punctuation/extra spaces (helps if Odoo varies)
  const normalized = key
    .replace(/\s+/g, " ")
    .replace(/[.]/g, "")
    .replace(/[,]/g, "")
    .trim();

  const MAP2: Record<string, string> = Object.fromEntries(
    Object.entries(MAP).map(([k, v]) => [
      k.replace(/\s+/g, " ").replace(/[.]/g, "").replace(/[,]/g, "").trim(),
      v,
    ])
  );

  return MAP2[normalized] || raw; // fallback: keep original
}

function buildApiUrl(path: string) {
  const base = SD_API_BASE.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function TopTable({
  rows,
  titleKey,
  limit = 50,
}: {
  rows: GroupRow[];
  titleKey: string;
  limit?: number;
}) {
  const show = rows.slice(0, limit);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[260px]">{titleKey}</TableHead>
            <TableHead className="text-right w-[180px]">Amount</TableHead>
            <TableHead className="text-right w-[100px]">Rows</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {show.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-medium">{r.key}</TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtNumber(Number(r.amount || 0))}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {Number(r.count || 0)}
              </TableCell>
            </TableRow>
          ))}
          {rows.length > limit ? (
            <TableRow>
              <TableCell colSpan={3} className="text-sm text-muted-foreground">
                Showing top {limit} of {rows.length}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

export default function FY() {
  const [data, setData] = useState<FyTablePayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [customer, setCustomer] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  const [masterCategoryFilter, setMasterCategoryFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subCategoryFilter, setSubCategoryFilter] = useState("");

  const [source, setSource] = useState<"all" | "odoo" | "bc">("all");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("service", "SalesDashboard");
    params.set("fy", DEFAULT_FY.join(","));
    params.set("includeEntryTypes", "Sale");

    params.set("source", source); // ✅ all | odoo | bc

    // BC should still exclude inter-company; Odoo-only should not.
    params.set("excludeIntercompany", source === "odoo" ? "false" : "true");

    // includeOdoo only when source needs it
    params.set("includeOdoo", source !== "bc" ? "true" : "false");

    if (customer.trim()) params.set("customer", customer.trim());
    if (description.trim()) params.set("description", description.trim());
    if (category.trim()) params.set("category", category.trim());
    if (masterCategoryFilter.trim())
      params.set("masterCategory", masterCategoryFilter.trim());
    if (categoryFilter.trim())
      params.set("categoryFilter", categoryFilter.trim());
    if (subCategoryFilter.trim())
      params.set("subCategory", subCategoryFilter.trim());

    return params.toString();
  }, [
    customer,
    description,
    category,
    masterCategoryFilter,
    categoryFilter,
    subCategoryFilter,
    source,
  ]);

  const jsonUrl = useMemo(
    () => buildApiUrl(`/api/sd/fy-table?${query}`),
    [query]
  );
  const xlsxUrl = useMemo(
    () => buildApiUrl(`api/sd/fy-table.xlsx?${query}`),
    [query]
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(jsonUrl);
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      const json = JSON.parse(text) as FyTablePayload;
      setData(json);
    } catch (e: any) {
      setErr(String(e?.message || e || "Failed to load FY table"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonUrl]);

  const columns = useMemo(() => {
    const cols = (data?.table?.columns || DEFAULT_FY) as string[];
    return cols.filter((c) => /^FY\d{2}$/.test(c));
  }, [data]);

  const rows = data?.table?.rows || [];
  const totals = data?.table?.totals || {};
  const groups = data?.table?.groups || {};
  const odooCompanyRows: GroupRow[] = useMemo(() => {
    const src = groups.byCompany || [];

    // 1) Drop empty buckets (this hides parent company if it's truly 0 rows)
    const nonZero = src.filter((r) => Number(r.count || 0) > 0);

    // 2) Replace key with just the country label
    return nonZero.map((r) => ({
      ...r,
      key: companyToCountry(r.key),
    }));
  }, [groups.byCompany]);

  const quarterRowSpans: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.fq] = (map[r.fq] || 0) + 1;
    return map;
  }, [rows]);

  const quarterFirstRowIndex: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((r, idx) => {
      if (map[r.fq] == null) map[r.fq] = idx;
    });
    return map;
  }, [rows]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">FY Sales Table</h1>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>

            <Button
              onClick={() => window.open(xlsxUrl, "_blank")}
              disabled={loading}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Excel
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={source === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSource("all")}
                >
                  All (BC + Odoo)
                </Button>
                <Button
                  variant={source === "odoo" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSource("odoo")}
                >
                  Odoo only
                </Button>
                <Button
                  variant={source === "bc" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSource("bc")}
                >
                  BC only
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {data?.meta?.company ? (
                  <Badge variant="secondary">{data.meta.company}</Badge>
                ) : null}
                {data?.meta?.environment ? (
                  <Badge variant="outline">{data.meta.environment}</Badge>
                ) : null}

                {data?.meta?.odoo?.enabled ? (
                  <Badge
                    variant={data.meta.odoo.ok ? "secondary" : "destructive"}
                  >
                    Foreign (Odoo):{" "}
                    {data.meta.odoo.ok
                      ? `${data.meta.odoo.rowCount} rows`
                      : "failed"}
                  </Badge>
                ) : null}

                {data?.meta?.excludeIntercompany ? (
                  <Badge variant="outline">
                    Intercompany excluded (
                    {data.meta.intercompanyGroupCompanyCount} names)
                  </Badge>
                ) : null}

                {data?.meta?.intercompanyGroupCompanies?.length ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Info className="mr-2 h-4 w-4" />
                        View excluded names
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>
                          Excluded intercompany customer names
                        </DialogTitle>
                      </DialogHeader>
                      <div className="max-h-[60vh] overflow-auto rounded-md border p-3 text-sm">
                        <ol className="list-decimal pl-5 space-y-1">
                          {data.meta.intercompanyGroupCompanies.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ol>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                placeholder="Filter: Customer contains…"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
              />
              <Input
                placeholder="Filter: Description contains…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <Input
                placeholder="Filter: Category/SKU contains…"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                placeholder="Filter: Master Category contains…"
                value={masterCategoryFilter}
                onChange={(e) => setMasterCategoryFilter(e.target.value)}
              />
              <Input
                placeholder="Filter: Category contains…"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              />
              <Input
                placeholder="Filter: Sub Category contains…"
                value={subCategoryFilter}
                onChange={(e) => setSubCategoryFilter(e.target.value)}
              />
            </div>

            {data?.table?.debug ? (
              <div className="text-xs text-muted-foreground">
                Rows fetched: {data.table.debug.rowCount ?? "-"} • Used:{" "}
                {data.table.debug.usedRowCount ?? "-"} • Skipped intercompany:{" "}
                {data.table.debug.skippedIntercompany ?? "-"} • Unmapped SKU
                hits: {data.table.debug.unmappedSkuCount ?? "-"}
              </div>
            ) : null}
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : err ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                  <div>
                    <div className="font-medium text-destructive">
                      Failed to load FY table
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground break-words">
                      {err}
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      Tip: set{" "}
                      <code className="px-1 py-0.5 rounded bg-muted">
                        VITE_SD_API_BASE_URL
                      </code>{" "}
                      to your sd.cjs host.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Tabs defaultValue="fy" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="fy">FY Table</TabsTrigger>
                  <TabsTrigger value="cust">Plus: By Customer</TabsTrigger>

                  {/* existing "cat" tab kept (works for all/odoo/bc with your current logic) */}
                  <TabsTrigger value="cat">
                    {source === "odoo"
                      ? "Plus: By Line"
                      : source === "bc"
                      ? "Plus: By Description"
                      : "Plus: By Category"}
                  </TabsTrigger>

                  {source === "odoo" ? (
                    <TabsTrigger value="co">Odoo: By Company</TabsTrigger>
                  ) : null}

                  {/* ✅ NEW: BC-only classification tabs */}
                  {source === "bc" ? (
                    <>
                      <TabsTrigger value="bc_master">
                        BC: Master Category
                      </TabsTrigger>
                      <TabsTrigger value="bc_category">
                        BC: Category
                      </TabsTrigger>
                      <TabsTrigger value="bc_sub">BC: Sub Category</TabsTrigger>
                      <TabsTrigger value="bc_base">
                        BC: Product Base
                      </TabsTrigger>
                    </>
                  ) : null}
                </TabsList>

                <TabsContent value="fy">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[90px]">FQ</TableHead>
                          <TableHead className="w-[90px]">Month</TableHead>
                          {columns.map((c) => (
                            <TableHead
                              key={c}
                              className="text-right min-w-[160px]"
                            >
                              {c}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {rows.map((r, idx) => {
                          const fq = r.fq;
                          const isFirstInQuarter =
                            quarterFirstRowIndex[fq] === idx;
                          const span = quarterRowSpans[fq] || 1;

                          return (
                            <TableRow key={`${fq}-${r.month}-${idx}`}>
                              {isFirstInQuarter ? (
                                <TableCell
                                  rowSpan={span}
                                  className="align-middle font-semibold"
                                >
                                  {fq}
                                </TableCell>
                              ) : null}

                              <TableCell className="font-medium">
                                {r.month}
                              </TableCell>

                              {columns.map((c) => (
                                <TableCell
                                  key={c}
                                  className="text-right tabular-nums"
                                >
                                  {fmtNumber(Number(r[c] || 0))}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}

                        <TableRow>
                          <TableCell colSpan={2} className="font-semibold">
                            Total
                          </TableCell>
                          {columns.map((c) => (
                            <TableCell
                              key={c}
                              className="text-right font-semibold tabular-nums"
                            >
                              {fmtNumber(Number(totals[c] || 0))}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
                {source === "odoo" ? (
                  <TabsContent value="co">
                    <TopTable
                      titleKey="Company"
                      rows={odooCompanyRows}
                      limit={50}
                    />
                  </TabsContent>
                ) : null}

                <TabsContent value="cust">
                  <TopTable
                    titleKey="Customer"
                    rows={groups.byCustomer || []}
                    limit={50}
                  />
                </TabsContent>

                <TabsContent value="cat">
                  <TopTable
                    titleKey={
                      source === "odoo"
                        ? "Line"
                        : source === "bc"
                        ? "Description"
                        : "Category"
                    }
                    rows={
                      source === "odoo"
                        ? groups.byDescription || []
                        : groups.byCategory || []
                    }
                    limit={100}
                  />
                </TabsContent>
                {/* ✅ NEW: BC-only classification tables */}
                {source === "bc" ? (
                  <>
                    <TabsContent value="bc_master">
                      <TopTable
                        titleKey="Master Category"
                        rows={groups.byMasterCategory || []}
                        limit={100}
                      />
                    </TabsContent>

                    <TabsContent value="bc_category">
                      <TopTable
                        titleKey="Category"
                        rows={groups.byCategory || []}
                        limit={100}
                      />
                    </TabsContent>

                    <TabsContent value="bc_sub">
                      <TopTable
                        titleKey="Sub Category"
                        rows={groups.bySubCategory || []}
                        limit={100}
                      />
                    </TabsContent>

                    <TabsContent value="bc_base">
                      <TopTable
                        titleKey="Product Base Name"
                        rows={groups.byProductBaseName || []}
                        limit={150}
                      />
                    </TabsContent>
                  </>
                ) : null}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
