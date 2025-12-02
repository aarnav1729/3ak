// app/src/pages/Index.tsx
import { useState, useEffect } from "react";
import {
  RefreshCw,
  Building2,
  TrendingUp,
  Package,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionShell } from "@/components/dashboard/SectionShell";
import { DataList } from "@/components/dashboard/DataList";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatCurrency, formatNumber } from "@/utils/format";

const API_BASE_URL =
import.meta.env.VITE_API_BASE_URL || "https://threeak.onrender.com";

//const API_BASE_URL =
  //import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type SalesKpis = {
  totalSalesInRange: number;
  ytdSales: number;
  mtdSales: number;
  qtdSales: number;
  lastQuarterSales: number;
};

type SalesMonthlyPoint = {
  year: number;
  month: number; // 1–12
  label: string;
  totalSales: number;
};

type YearMonthPoint = {
  year: number;
  month: number; // 1–12
  label: string;
  totalSales: number;
};

type SalesCustomerRow = {
  customerNumber: string;
  customerName: string;
  totalSales: number;
  invoiceCount: number;
};

type SalesSkuRow = {
  itemNumber: string;
  description: string;
  totalSales: number;
  totalQuantity: number;
  lineCount: number;
  packageType: string;
};

type SalesCustomerSkuRow = {
  customerNumber: string;
  customerName: string;
  itemNumber: string;
  description: string;
  totalSales: number;
  totalQuantity: number;
};

type SalesChannelRow = {
  channelKey: string;
  channelLabel: string;
  totalSales: number;
  invoiceCount: number;
};

type SalesChannelInvoiceRow = {
  invoiceNumber: string;
  postingDate: string; // ISO date string
  customerNumber: string;
  customerName: string;
  channelKey: string;
  channelLabel: string;
  amount: number;
};

type SalesAnalytics = {
  meta: {
    companyName: string;
    generatedAt: string;
    range: { from: string; to: string };
  };
  kpis: SalesKpis;
  monthlyHistogram: SalesMonthlyPoint[];
  yearMonthSeries: YearMonthPoint[];
  salesByCustomer: SalesCustomerRow[];
  salesBySku: SalesSkuRow[];
  salesByCustomerSku?: SalesCustomerSkuRow[]; // 👈 per-customer SKU split
  salesByChannel: SalesChannelRow[];
  salesByChannelInvoices?: SalesChannelInvoiceRow[];
  granularity: string;
};

type InventoryAgingRow = {
  itemNumber: string;
  itemName: string;
  inventoryQty: number;
  inventoryValue: number;
  unitCost: number;
  lastInflowDate: string | null;
  ageDays: number | null;
  bucketKey: string;
  bucketLabel: string;
};

type InventoryBucketSummary = {
  key: string;
  label: string;
  totalQty: number;
  totalValue: number;
};

type AvailabilityRow = {
  itemNumber: string;
  itemName: string;
  inventoryQty: number;
  unitCost: number;
  inventoryValue: number;
  blocked: boolean;
  availabilityStatus: string;
};

type ProdConsRow = {
  periodId: string;
  periodLabel: string;
  rmConsumedQty: number;
  rmConsumedValue: number;
  pmConsumedQty: number;
  pmConsumedValue: number;
  sfgProducedQty: number;
  sfgProducedValue: number;
  fg2511ProducedQty: number;
  fg2511ProducedValue: number;
};

type InventoryAnalytics = {
  meta: {
    companyName: string;
    generatedAt: string;
    range: { from: string; to: string };
    groupBy: string;
  };
  inventoryAgingBySku: InventoryAgingRow[];
  agingBucketSummary: InventoryBucketSummary[];
  availabilityBySku: AvailabilityRow[];
  productionConsumptionSeries: ProdConsRow[];
};

type VendorAgingRow = {
  vendorNumber: string;
  vendorName: string;
  balanceDue: number;
  currentAmount: number;
  period1Description: string;
  period1Amount: number;
  period2Description: string;
  period2Amount: number;
  period3Description: string;
  period3Amount: number;
  currencyCode: string;
};

type VendorAgingTotals = {
  totalBalance: number;
  totalCurrent: number;
  totalPeriod1: number;
  totalPeriod2: number;
  totalPeriod3: number;
};

type VendorAgingAnalytics = {
  meta: {
    companyName: string;
    generatedAt: string;
  };
  totals: VendorAgingTotals;
  vendors: VendorAgingRow[];
};

type MdSnapshot = {
  salesAnalytics: SalesAnalytics;
  inventoryAnalytics: InventoryAnalytics;
  vendorAgingAnalytics: VendorAgingAnalytics;
  meta?: {
    builtAt?: string;
    source?: string;
    defaultFrom?: string;
    defaultTo?: string;
    granularity?: string;
  };
};

type Granularity = "day" | "month" | "quarter" | "year";

type ChannelRootGroup = "Domestic" | "Export";

function getChannelRootGroup(row: SalesChannelRow): ChannelRootGroup {
  // Adjust this logic if your labels differ; for now:
  // anything with "export" in the label is Export, everything else is Domestic
  const label = row.channelLabel.toLowerCase();
  return label.includes("export") ? "Export" : "Domestic";
}

/* -------------------------------------------------------------------------- */
/*  Helper: Month-over-Month series (Jan–Dec x-axis, 1 line per year)        */
/* -------------------------------------------------------------------------- */

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function buildYearLineSeries(raw: YearMonthPoint[]) {
  // Build totals[year][month] = sum(totalSales)
  const totals: Record<number, Record<number, number>> = {};
  const years = new Set<number>();

  raw.forEach((p) => {
    if (!p.year || !p.month) return;
    years.add(p.year);
    if (!totals[p.year]) totals[p.year] = {};
    totals[p.year][p.month] =
      (totals[p.year][p.month] || 0) + Number(p.totalSales || 0);
  });

  const sortedYears = Array.from(years).sort((a, b) => a - b);

  // Build 12 rows: Jan..Dec
  const data = MONTH_LABELS.map((label, idx) => {
    const monthIndex = idx + 1; // 1–12
    const row: Record<string, any> = { label };
    sortedYears.forEach((y) => {
      const key = String(y);
      const value = totals[y]?.[monthIndex];
      if (value != null) {
        row[key] = value;
      }
    });
    return row;
  });

  return {
    data,
    years: sortedYears,
  };
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

const Index = () => {
  const [sales, setSales] = useState<SalesAnalytics | null>(null);
  const [inventory, setInventory] = useState<InventoryAnalytics | null>(null);
  const [vendorAging, setVendorAging] = useState<VendorAgingAnalytics | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Global filters for range + granularity
  const [fromDate, setFromDate] = useState<string>(() => {
    // 🔁 Default = "all time" from a very early date so subsequent ranges are subsets
    const d = new Date(2000, 0, 1); // 2000-01-01
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [granularity, setGranularity] = useState<Granularity>("month");

  // Drilldown state for "Sales by Channel"
  const [channelLevel, setChannelLevel] = useState<"root" | "segments">("root");
  const [channelRootGroup, setChannelRootGroup] =
    useState<ChannelRootGroup | null>(null);
  const [showChannelTable, setShowChannelTable] = useState(false);

  // NEW: which segment within Domestic/Export was clicked
  const [selectedSegmentKey, setSelectedSegmentKey] = useState<string | null>(
    null
  );
  const [selectedSegmentLabel, setSelectedSegmentLabel] = useState<
    string | null
  >(null);

  // Drilldown state for "Sales by Customer" → SKU donut
  const [selectedCustomer, setSelectedCustomer] =
    useState<SalesCustomerRow | null>(null);

  const customerSkuRows: SalesCustomerSkuRow[] =
    selectedCustomer && sales.salesByCustomerSku
      ? sales.salesByCustomerSku.filter(
          (row) => row.customerNumber === selectedCustomer.customerNumber
        )
      : [];

  // Limit SKU slices for readability (Top N + Others)
  const MAX_SKU_SLICES = 12;
  const customerSkuChartData: SalesCustomerSkuRow[] = (() => {
    if (!customerSkuRows.length) return [];

    const sorted = [...customerSkuRows].sort(
      (a, b) => b.totalSales - a.totalSales
    );
    const top = sorted.slice(0, MAX_SKU_SLICES);
    const tail = sorted.slice(MAX_SKU_SLICES);

    const othersTotal = tail.reduce((sum, r) => sum + (r.totalSales || 0), 0);
    const othersQty = tail.reduce((sum, r) => sum + (r.totalQuantity || 0), 0);

    if (othersTotal > 0) {
      return [
        ...top,
        {
          customerNumber: selectedCustomer!.customerNumber,
          customerName: selectedCustomer!.customerName,
          itemNumber: "OTHERS",
          description: "Others",
          totalSales: othersTotal,
          totalQuantity: othersQty,
        },
      ];
    }

    return top;
  })();

  const channelInvoiceRows: SalesChannelInvoiceRow[] =
    selectedSegmentKey && sales.salesByChannelInvoices
      ? sales.salesByChannelInvoices.filter(
          (row) => row.channelKey === selectedSegmentKey
        )
      : [];

  const loadAll = async (showToast = false) => {
    try {
      setRefreshing(true);

      const params = new URLSearchParams();
      params.set("from", fromDate);
      params.set("to", toDate);
      params.set("granularity", granularity);
      params.set("groupBy", granularity);

      const [salesRes, invRes, vendorRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/md/sales-analytics?${params.toString()}`, {
          credentials: "include",
        }),
        fetch(
          `${API_BASE_URL}/api/md/inventory-analytics?${params.toString()}`,
          { credentials: "include" }
        ),
        fetch(`${API_BASE_URL}/api/md/vendor-aging`, {
          credentials: "include",
        }),
      ]);

      if (!salesRes.ok) throw new Error(`Sales HTTP ${salesRes.status}`);
      if (!invRes.ok) throw new Error(`Inventory HTTP ${invRes.status}`);
      if (!vendorRes.ok) throw new Error(`Vendor HTTP ${vendorRes.status}`);

      const [salesJson, invJson, vendorJson] = await Promise.all([
        salesRes.json(),
        invRes.json(),
        vendorRes.json(),
      ]);

      setSales(salesJson as SalesAnalytics);
      setInventory(invJson as InventoryAnalytics);
      setVendorAging(vendorJson as VendorAgingAnalytics);

      if (showToast) {
        toast({
          title: "Analytics refreshed",
          description:
            "Sales, inventory, and vendor ageing data reloaded from Business Central.",
        });
      }
    } catch (err) {
      console.error("Failed to load analytics", err);
      toast({
        title: "Analytics error",
        description:
          "Could not load analytics from the MD API. Please verify the server/BC connection.",
        variant: "destructive",
      });
    } finally {
      // ⚠️ DO NOT setLoading(true/false) here – we only use `refreshing`
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        // 1) Try to load the precomputed snapshot (fast)
        const snapshotRes = await fetch(`${API_BASE_URL}/api/md/snapshot`, {
          credentials: "include",
        });

        if (!snapshotRes.ok) {
          console.warn(
            "MD snapshot not available or failed, status:",
            snapshotRes.status
          );
          // Fallback: hit live APIs once so the screen still works
          const [salesJson, invJson, vendorJson] = await Promise.all([
            fetch(
              `${API_BASE_URL}/api/md/sales-analytics?from=${fromDate}&to=${toDate}&granularity=${granularity}`,
              { credentials: "include" }
            ).then((r) => r.json()),
            fetch(
              `${API_BASE_URL}/api/md/inventory-analytics?from=${fromDate}&to=${toDate}&groupBy=${granularity}`,
              { credentials: "include" }
            ).then((r) => r.json()),
            fetch(`${API_BASE_URL}/api/md/vendor-aging`, {
              credentials: "include",
            }).then((r) => r.json()),
          ]);

          if (!cancelled) {
            setSales(salesJson as SalesAnalytics);
            setInventory(invJson as InventoryAnalytics);
            setVendorAging(vendorJson as VendorAgingAnalytics);
            setLoading(false);
          }
          return;
        }

        // 2) Snapshot OK -> use it and DONE
        const snapshot = (await snapshotRes.json()) as MdSnapshot;

        if (!cancelled) {
          setSales(snapshot.salesAnalytics);
          setInventory(snapshot.inventoryAnalytics);
          setVendorAging(snapshot.vendorAgingAnalytics);
          setLoading(false);
        }
      } catch (err) {
        console.error("Bootstrap error", err);
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilters = () => {
    loadAll(true);
  };

  if (loading || !sales || !inventory || !vendorAging) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  const yearLine = buildYearLineSeries(sales.yearMonthSeries || []);
  const yearKeys = yearLine.years.map((y) => String(y));

  // Build a stable color per year for the histogram
  const barColorPalette = [
    "#2563eb", // blue
    "#16a34a", // green
    "#f97316", // orange
    "#dc2626", // red
    "#7c3aed", // violet
    "#0f766e", // teal
  ];

  // Specific colors for Domestic vs Export (root pie)
  const channelRootColors: Record<ChannelRootGroup, string> = {
    Domestic: "#2563eb", // blue
    Export: "#f97316", // orange
  };

  // Reuse the same palette for the line chart (Month-over-Month Sales by Year)
  const lineYearColors: Record<string, string> = {};
  yearKeys.forEach((yk, idx) => {
    lineYearColors[yk] = barColorPalette[idx % barColorPalette.length];
  });

  const barYearColors: Record<number, string> = {};
  let colorIndex = 0;

  if (sales?.monthlyHistogram?.length) {
    for (const row of sales.monthlyHistogram) {
      if (row.year != null && barYearColors[row.year] == null) {
        barYearColors[row.year] =
          barColorPalette[colorIndex % barColorPalette.length];
        colorIndex++;
      }
    }
  }

  // ------------------- Sales by Channel drilldown data ------------------------

  const channelTopData = (() => {
    const totals: Record<
      ChannelRootGroup,
      {
        key: ChannelRootGroup;
        label: string;
        totalSales: number;
        invoiceCount: number;
      }
    > = {
      Domestic: {
        key: "Domestic",
        label: "Domestic",
        totalSales: 0,
        invoiceCount: 0,
      },
      Export: {
        key: "Export",
        label: "Export",
        totalSales: 0,
        invoiceCount: 0,
      },
    };

    sales.salesByChannel.forEach((row) => {
      const g = getChannelRootGroup(row);
      totals[g].totalSales += row.totalSales;
      totals[g].invoiceCount += row.invoiceCount;
    });

    return Object.values(totals).filter((t) => t.totalSales > 0);
  })();

  const domesticSegments = sales.salesByChannel.filter(
    (r) => getChannelRootGroup(r) === "Domestic"
  );
  const exportSegments = sales.salesByChannel.filter(
    (r) => getChannelRootGroup(r) === "Export"
  );

  const currentSegmentData =
    channelRootGroup === "Domestic" ? domesticSegments : exportSegments;

  // ------------------- Sales by Customer histograms ---------------------------

  // ------------------- Sales by Customer histogram (Top 15 + Others) ---------

  // ------------------- Sales by Customer histogram (Top 25 only) -------------

  const MAX_TOP_CUSTOMERS = 25;

  const sortedCustomers = [...(sales.salesByCustomer || [])].sort(
    (a, b) => b.totalSales - a.totalSales
  );

  const customerHistogramData: SalesCustomerRow[] = sortedCustomers.slice(
    0,
    MAX_TOP_CUSTOMERS
  );

  /* ------------------------------------------------------------------------ */
  /*  Render                                                                  */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* 🔁 Full-width container across viewport */}
      <div className="w-full px-4 md:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 bg-white p-6 rounded-xl shadow-sm border border-border gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {sales.meta.companyName}
              </h1>
              <p className="text-muted-foreground">
                unified sales, inventory & vendor analytics
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Data source: Microsoft Dynamics 365 Business Central API
              </p>
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-right text-xs md:text-sm">
                <div className="text-muted-foreground">Range</div>
                <div className="font-medium">
                  {fromDate} → {toDate}
                </div>
                <div className="text-muted-foreground mt-1">
                  Grouped by: <span className="font-medium">{granularity}</span>
                </div>
                <div className="text-muted-foreground mt-1">
                  Last updated:{" "}
                  {new Date(sales.meta.generatedAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Global filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs md:text-sm">
                <span className="text-muted-foreground">From</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="border rounded-md px-2 py-1 text-xs md:text-sm"
                />
              </div>
              <div className="flex items-center gap-1 text-xs md:text-sm">
                <span className="text-muted-foreground">To</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="border rounded-md px-2 py-1 text-xs md:text-sm"
                />
              </div>
              <div className="flex items-center gap-1 text-xs md:text-sm">
                <span className="text-muted-foreground">Group by</span>
                <select
                  value={granularity}
                  onChange={(e) =>
                    setGranularity(e.target.value as Granularity)
                  }
                  className="border rounded-md px-2 py-1 text-xs md:text-sm"
                >
                  <option value="day">Day</option>
                  <option value="month">Month</option>
                  <option value="quarter">Quarter</option>
                  <option value="year">Year</option>
                </select>
              </div>

              <Button
                onClick={handleApplyFilters}
                disabled={refreshing}
                variant="default"
                size="sm"
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
                />
                Apply
              </Button>
            </div>
          </div>
        </motion.header>

        {/* Main Dashboard Sections */}
        <div className="space-y-8">
          {/* -------------------------------------------------------------- */}
          {/* 1. Sales Analytics                                             */}
          {/* -------------------------------------------------------------- */}
          <SectionShell
            title="Sales Analytics"
            description="Covers order-to-cash performance entirely from the salesInvoice and salesInvoiceLine tables in Business Central. Invoice-level amounts (totalAmountIncludingTax / totalAmountExcludingTax) drive the KPIs, monthly and yearly timelines, while salesInvoiceLine powers SKU-level breakdowns. The date filters above are applied using the invoice postingDate."
            icon={TrendingUp}
          >
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <KpiCard
                label="Total Sales (Selected Range)"
                value={sales.kpis.totalSalesInRange}
                hint="Sum of invoice amounts between the selected From–To dates (salesInvoice)."
              />
              <KpiCard
                label="Sales YTD (Fiscal)"
                value={sales.kpis.ytdSales}
                hint="From fiscal year start (1-Apr) until today, using salesInvoice.postingDate."
              />
              <KpiCard
                label="Sales MTD"
                value={sales.kpis.mtdSales}
                hint="From first calendar day of this month until today."
              />
              <KpiCard
                label="Sales QTD (Fiscal Quarter)"
                value={sales.kpis.qtdSales}
                hint="From the start of the current fiscal quarter until today."
              />
              <KpiCard
                label="Last Quarter Sales"
                value={sales.kpis.lastQuarterSales}
                hint="Full previous fiscal quarter (3 months) of sales."
              />
            </div>

            {/* Charts: histogram + yearly line */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* MoM Histogram */}
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold mb-1">
                  Monthly Sales Histogram
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Bars show month-over-month total sales within the currently
                  selected date range. Calculated by aggregating invoice amounts
                  in salesInvoice by posting month.
                </p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sales.monthlyHistogram}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis
                        tickFormatter={(v) => `${(v / 1e7).toFixed(1)} Cr`}
                      />
                      <Tooltip
                        formatter={(v: any) =>
                          `${formatCurrency(Number(v))} (₹)`
                        }
                      />
                      <Bar dataKey="totalSales">
                        {sales.monthlyHistogram.map(
                          (entry: any, index: number) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                barYearColors[entry.year] || barColorPalette[0]
                              }
                            />
                          )
                        )}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Line chart: Month-over-Month, 1 line per year (Jan–Dec x-axis) */}
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold mb-1">
                  Month-over-Month Sales by Year
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Each line represents a calendar year, with points per month
                  from Jan to Dec. Data is derived from all salesInvoice rows,
                  grouping by postingDate year and month.
                </p>
                <div className="h-64">
                  {yearLine.data.length === 0 || yearKeys.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                      No year-over-year monthly data available.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={yearLine.data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis
                          tickFormatter={(v) =>
                            `${(Number(v) / 1e7).toFixed(1)} Cr`
                          }
                        />
                        <Tooltip
                          formatter={(v: any) =>
                            `${formatCurrency(Number(v))} (₹)`
                          }
                        />
                        <Legend />
                        {yearKeys.map((yk) => (
                          <Line
                            key={yk}
                            type="monotone"
                            dataKey={yk}
                            dot={false}
                            strokeWidth={2}
                            connectNulls
                            stroke={lineYearColors[yk]}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Sales by Customer Histogram (Top 15 + Others) */}
            {/* Sales by Customer Histogram (Top 25 + Others) */}
            {/* Sales by Customer Histogram (Top 25 only + drilldown) */}
            <div className="bg-card rounded-lg border border-border p-4 mb-6">
              <h3 className="text-sm font-semibold mb-1">
                Sales by Customer: Top 25
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Top 25 customers by total invoice amount within the selected
                date range. Click any bar to see that customer&apos;s product
                SKU split in the donut chart below.
              </p>

              <div className="h-80">
                {customerHistogramData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    No customer sales data available for the selected range.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    {/* Top 25 histogram */}
                    <BarChart data={customerHistogramData} barCategoryGap="40%">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="customerName"
                        tick={{ fontSize: 10 }}
                        interval={0}
                        angle={-60}
                        textAnchor="end"
                        height={90}
                      />
                      <YAxis
                        tickFormatter={(v) =>
                          `${(Number(v) / 1e7).toFixed(1)} Cr`
                        }
                      />
                      <Tooltip
                        formatter={(v: any, name) => [
                          `${formatCurrency(Number(v))} (₹)`,
                          name === "totalSales" ? "Sales" : name,
                        ]}
                        labelFormatter={(label, payload) => {
                          const row = payload?.[0]?.payload as
                            | SalesCustomerRow
                            | undefined;
                          if (!row) return label;
                          return `${row.customerName} (${row.customerNumber})`;
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="totalSales"
                        name="Sales (₹)"
                        barSize={14}
                        onClick={(data) => {
                          const row = data?.payload as
                            | SalesCustomerRow
                            | undefined;
                          if (!row) return;
                          setSelectedCustomer(row);
                        }}
                      >
                        {customerHistogramData.map((entry, index) => (
                          <Cell
                            key={`cust-bar-${entry.customerNumber}-${index}`}
                            fill={
                              barColorPalette[index % barColorPalette.length]
                            }
                            cursor="pointer"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* SKU donut drilldown */}
              <div className="mt-4 border-t pt-4">
                <h4 className="text-xs font-semibold mb-1">
                  SKU Mix for Selected Customer
                </h4>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Click a bar in the Top 25 chart above to see that
                  customer&apos;s product SKU split based on sales value.
                </p>

                {selectedCustomer && customerSkuChartData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={customerSkuChartData}
                          dataKey="totalSales"
                          nameKey="itemNumber"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          label={(entry: SalesCustomerSkuRow) =>
                            entry.itemNumber === "OTHERS"
                              ? "Others"
                              : entry.itemNumber
                          }
                        >
                          {customerSkuChartData.map((row, idx) => (
                            <Cell
                              key={`${row.itemNumber}-${idx}`}
                              fill={
                                row.itemNumber === "OTHERS"
                                  ? "#6b7280"
                                  : barColorPalette[
                                      idx % barColorPalette.length
                                    ]
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: any, name, props: any) => {
                            const row = props?.payload as SalesCustomerSkuRow;
                            const label =
                              row.description && row.itemNumber !== "OTHERS"
                                ? `${row.itemNumber} – ${row.description}`
                                : row.itemNumber;
                            return [`${formatCurrency(Number(v))} (₹)`, label];
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-16 flex items-center text-[11px] text-muted-foreground">
                    {selectedCustomer
                      ? "No SKU breakdown data available for this customer."
                      : "No customer selected yet. Click a bar above to view SKU mix."}
                  </div>
                )}
              </div>
            </div>

            {/* Tables: Sales by customer + SKU */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold mb-1">
                  Sales by Customer (Range)
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Aggregates invoice amounts in salesInvoice for each customer
                  within the selected date range. Shows total billing and count
                  of invoices per customer.
                </p>
                <DataList<SalesCustomerRow>
                  data={sales.salesByCustomer}
                  columns={[
                    {
                      key: "customerName",
                      label: "Customer",
                      sortable: true,
                    },
                    {
                      key: "customerNumber",
                      label: "Number",
                      sortable: true,
                    },
                    {
                      key: "invoiceCount",
                      label: "Invoices",
                      sortable: true,
                      render: (v) => formatNumber(v),
                      align: "right",
                    },
                    {
                      key: "totalSales",
                      label: "Sales (₹)",
                      sortable: true,
                      render: (v) => formatCurrency(v),
                      align: "right",
                    },
                  ]}
                />
              </div>

              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold mb-1">
                  Sales by SKU (Range)
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Uses salesInvoiceLine joined to its parent invoice to compute
                  per-SKU quantities and values across the selected date range.
                  Line amounts are based on lineAmount / amountIncludingTax.
                </p>
                <DataList<SalesSkuRow>
                  data={sales.salesBySku}
                  columns={[
                    {
                      key: "itemNumber",
                      label: "Item",
                      sortable: true,
                    },
                    {
                      key: "description",
                      label: "Description",
                      sortable: true,
                    },
                    {
                      key: "totalQuantity",
                      label: "Qty",
                      sortable: true,
                      render: (v) => formatNumber(v),
                      align: "right",
                    },
                    {
                      key: "totalSales",
                      label: "Sales (₹)",
                      sortable: true,
                      render: (v) => formatCurrency(v),
                      align: "right",
                    },
                  ]}
                />
              </div>
            </div>

            {/* Channel breakdown */}
            {/* Channel breakdown with drilldown */}
            <div className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold">
                  Sales by Channel (Domestic vs Export)
                </h3>
                {channelLevel === "segments" && (
                  <button
                    className="text-[11px] text-primary hover:underline"
                    onClick={() => {
                      setChannelLevel("root");
                      setChannelRootGroup(null);
                      setShowChannelTable(false);
                      setSelectedSegmentKey(null);
                      setSelectedSegmentLabel(null);
                    }}
                  >
                    ← Back to Domestic vs Export
                  </button>
                )}
              </div>

              <p className="text-xs text-muted-foreground mb-3">
                Top view shows Domestic vs Export. Click a slice to drill into
                that bucket&apos;s internal channel splits. On the deepest
                level, click a slice again to reveal the detailed channel table
                below the chart.
              </p>

              <div className="flex flex-col gap-4">
                {/* Chart + helper text */}
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        {channelLevel === "root" ? (
                          <Pie
                            data={channelTopData}
                            dataKey="totalSales"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            onClick={(data) => {
                              const payload = data?.payload as
                                | { key: ChannelRootGroup }
                                | undefined;
                              if (!payload) return;
                              setChannelRootGroup(payload.key);
                              setChannelLevel("segments");
                              setShowChannelTable(false);
                              setSelectedSegmentKey(null);
                              setSelectedSegmentLabel(null);
                            }}
                            label={(entry: { label: string }) => entry.label}
                          >
                            {channelTopData.map((c) => (
                              <Cell
                                key={c.key}
                                fill={channelRootColors[c.key]}
                              />
                            ))}
                          </Pie>
                        ) : (
                          <Pie
                            data={currentSegmentData}
                            dataKey="totalSales"
                            nameKey="channelLabel"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            onClick={(data) => {
                              const payload = data?.payload as
                                | SalesChannelRow
                                | undefined;
                              if (!payload) return;
                              // Last level of drilldown → show invoice rows for this segment
                              setSelectedSegmentKey(payload.channelKey);
                              setSelectedSegmentLabel(payload.channelLabel);
                              setShowChannelTable(true);
                            }}
                            label={(entry: SalesChannelRow) =>
                              entry.channelLabel
                            }
                          >
                            {currentSegmentData.map((c, idx) => (
                              <Cell
                                key={c.channelKey}
                                fill={
                                  barColorPalette[idx % barColorPalette.length]
                                }
                              />
                            ))}
                          </Pie>
                        )}
                        <Tooltip
                          formatter={(v: any) =>
                            `${formatCurrency(Number(v))} (₹)`
                          }
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="md:w-64 text-xs text-muted-foreground">
                    {channelLevel === "root" ? (
                      <p>
                        Step 1: Click{" "}
                        <span className="font-medium">Domestic</span> or{" "}
                        <span className="font-medium">Export</span> to drill
                        into that group&apos;s channel splits.
                      </p>
                    ) : (
                      <p>
                        Step 2: Viewing{" "}
                        <span className="font-medium">
                          {channelRootGroup ?? "selected"}
                        </span>{" "}
                        channels. Click any slice again to reveal the detailed
                        channel table below. Use the back link to return to
                        Domestic vs Export.
                      </p>
                    )}
                  </div>
                </div>

                {/* Table appears only on last level */}
                {channelLevel === "segments" &&
                  channelRootGroup &&
                  showChannelTable &&
                  selectedSegmentKey && (
                    <div className="mt-2">
                      <h4 className="text-xs font-semibold mb-1">
                        Channel Details – {selectedSegmentLabel}
                      </h4>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Showing individual invoices that contribute to this
                        channel total within the selected date range.
                      </p>

                      <DataList<SalesChannelInvoiceRow>
                        data={channelInvoiceRows}
                        columns={[
                          {
                            key: "invoiceNumber",
                            label: "Invoice",
                            sortable: true,
                          },
                          {
                            key: "postingDate",
                            label: "Posting Date",
                            sortable: true,
                            render: (v) => new Date(v).toLocaleDateString(),
                          },
                          {
                            key: "customerName",
                            label: "Customer",
                            sortable: true,
                          },
                          {
                            key: "customerNumber",
                            label: "Cust No.",
                            sortable: true,
                          },
                          {
                            key: "amount",
                            label: "Amount (₹)",
                            sortable: true,
                            render: (v) => formatCurrency(v),
                            align: "right",
                          },
                        ]}
                        maxHeight={260}
                      />
                    </div>
                  )}
              </div>
            </div>
          </SectionShell>

          {/* -------------------------------------------------------------- */}
          {/* 2. Inventory Aging, Availability & Production                  */}
          {/* -------------------------------------------------------------- */}
          <SectionShell
            title="Inventory Aging & Production"
            description="Shows how long stock has been sitting, what is currently available, and how raw/packing materials are being consumed versus SFG/FG (e.g., codes starting with 2511) produced. All data is computed from the item and itemLedgerEntry tables: item.inventory and item.unitCost give current stock and value, while itemLedgerEntry.postingDate, quantity, costAmountActual, and entryType drive age buckets and production/consumption flows."
            icon={Package}
          >
            {/* Aging summary buckets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {inventory.agingBucketSummary.map((b) => (
                <div
                  key={b.key}
                  className="bg-card border border-border rounded-lg p-4"
                >
                  <div className="text-xs text-muted-foreground">{b.label}</div>
                  <div className="text-lg font-semibold">
                    {formatNumber(b.totalQty)} units
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Value: {formatCurrency(b.totalValue)}
                  </div>
                </div>
              ))}
            </div>

            {/* Aging by SKU + Availability by SKU */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold mb-1">
                  Inventory Aging by SKU
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Each row represents a SKU from the item table with positive
                  inventory. The age bucket is based on the last inbound
                  movement date derived from itemLedgerEntry (purchase, output,
                  positive adjustment, or transfer in) versus today.
                </p>
                <DataList<InventoryAgingRow>
                  data={inventory.inventoryAgingBySku}
                  columns={[
                    {
                      key: "itemNumber",
                      label: "Item",
                      sortable: true,
                    },
                    {
                      key: "itemName",
                      label: "Description",
                      sortable: true,
                    },
                    {
                      key: "bucketLabel",
                      label: "Age Bucket",
                      sortable: true,
                    },
                    {
                      key: "inventoryQty",
                      label: "Qty",
                      sortable: true,
                      render: (v) => formatNumber(v),
                      align: "right",
                    },
                    {
                      key: "inventoryValue",
                      label: "Value (₹)",
                      sortable: true,
                      render: (v) => formatCurrency(v),
                      align: "right",
                    },
                  ]}
                  maxHeight={360}
                />
              </div>

              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold mb-1">
                  Inventory Availability by SKU
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Uses current item.inventory and item.unitCost to classify
                  items as In stock, Low, or Out of stock. You can tune
                  thresholds and blocked-item behavior server-side as needed.
                </p>
                <DataList<AvailabilityRow>
                  data={inventory.availabilityBySku}
                  columns={[
                    {
                      key: "itemNumber",
                      label: "Item",
                      sortable: true,
                    },
                    {
                      key: "itemName",
                      label: "Description",
                      sortable: true,
                    },
                    {
                      key: "availabilityStatus",
                      label: "Status",
                      sortable: true,
                    },
                    {
                      key: "inventoryQty",
                      label: "Qty",
                      sortable: true,
                      render: (v) => formatNumber(v),
                      align: "right",
                    },
                    {
                      key: "inventoryValue",
                      label: "Value (₹)",
                      sortable: true,
                      render: (v) => formatCurrency(v),
                      align: "right",
                    },
                  ]}
                  maxHeight={360}
                />
              </div>
            </div>

            {/* Production vs Consumption */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold mb-1">
                Production vs Material Consumption
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Compares raw material (RM) and packing material (PM) consumed
                against SFG and FG (codes starting with 2511) produced over the
                selected date range. Classification is based on item’s
                itemCategoryCode, inventoryPostingGroup, genProdPostingGroup,
                and code prefixes and can be adjusted in md.cjs. Quantities and
                values are aggregated from itemLedgerEntry.quantity and
                itemLedgerEntry.costAmountActual, grouped by the chosen
                granularity.
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inventory.productionConsumptionSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodLabel" />
                    <YAxis
                      tickFormatter={(v) =>
                        `${(Number(v) / 1e6).toFixed(1)} Lakh`
                      }
                    />
                    <Tooltip
                      formatter={(v: any) => `${formatCurrency(Number(v))} (₹)`}
                    />
                    <Legend />
                    <Bar
                      dataKey="rmConsumedValue"
                      name="RM Consumed (₹)"
                      stackId="cons"
                    />
                    <Bar
                      dataKey="pmConsumedValue"
                      name="PM Consumed (₹)"
                      stackId="cons"
                    />
                    <Bar
                      dataKey="sfgProducedValue"
                      name="SFG Produced (₹)"
                      stackId="prod"
                    />
                    <Bar
                      dataKey="fg2511ProducedValue"
                      name="FG 2511 Produced (₹)"
                      stackId="prod"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SectionShell>

          {/* -------------------------------------------------------------- */}
          {/* 3. Vendor Aging (Payables)                                     */}
          {/* -------------------------------------------------------------- */}
          <SectionShell
            title="Vendor Aging (Payables)"
            description="Shows how much is payable to each vendor and in which aging bucket it sits. All numbers are derived from the agedAccountsPayables table, using balanceDue for total exposure and currentAmount plus period1/2/3Amount for time buckets (e.g., 1–30, 31–60, 60+ days), along with the agingPeriod descriptions for readable labels."
            icon={Wallet}
          >
            {/* Totals */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <KpiCard
                label="Total Payables"
                value={vendorAging.totals.totalBalance}
                hint="Overall balanceDue across all vendors (agedAccountsPayables)."
              />
              <KpiCard
                label="Not Yet Due"
                value={vendorAging.totals.totalCurrent}
                hint="Sum of currentAmount (not yet overdue)."
              />
              <KpiCard
                label="Bucket 1"
                value={vendorAging.totals.totalPeriod1}
                hint="Sum of period1Amount (first overdue bucket; see description column for days)."
              />
              <KpiCard
                label="Bucket 2"
                value={vendorAging.totals.totalPeriod2}
                hint="Sum of period2Amount."
              />
              <KpiCard
                label="Bucket 3"
                value={vendorAging.totals.totalPeriod3}
                hint="Sum of period3Amount (oldest overdue bucket)."
              />
            </div>

            {/* Vendor list */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold mb-1">
                Vendor-wise Aging Detail
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Each row corresponds to a vendor row in agedAccountsPayables.
                The bucket descriptions (e.g., 1–30 days) come directly from
                agingPeriod1/2/3Description, with amounts in the matching
                periodXAmount columns.
              </p>
              <DataList<VendorAgingRow>
                data={vendorAging.vendors}
                columns={[
                  {
                    key: "vendorName",
                    label: "Vendor",
                    sortable: true,
                  },
                  {
                    key: "vendorNumber",
                    label: "Number",
                    sortable: true,
                  },
                  {
                    key: "balanceDue",
                    label: "Total Due (₹)",
                    sortable: true,
                    render: (v) => formatCurrency(v),
                    align: "right",
                  },
                  {
                    key: "currentAmount",
                    label: "Current (₹)",
                    sortable: true,
                    render: (v) => formatCurrency(v),
                    align: "right",
                  },
                  {
                    key: "period1Amount",
                    label: "Bucket 1 (₹)",
                    sortable: true,
                    render: (v, row) => (
                      <span title={row.period1Description}>
                        {formatCurrency(v)}
                      </span>
                    ),
                    align: "right",
                  },
                  {
                    key: "period2Amount",
                    label: "Bucket 2 (₹)",
                    sortable: true,
                    render: (v, row) => (
                      <span title={row.period2Description}>
                        {formatCurrency(v)}
                      </span>
                    ),
                    align: "right",
                  },
                  {
                    key: "period3Amount",
                    label: "Bucket 3 (₹)",
                    sortable: true,
                    render: (v, row) => (
                      <span title={row.period3Description}>
                        {formatCurrency(v)}
                      </span>
                    ),
                    align: "right",
                  },
                ]}
              />
            </div>
          </SectionShell>

          {/* Footer note */}
          <div className="text-[11px] text-muted-foreground text-right mt-4">
            All values are read-only snapshots from Business Central. For exact
            transactional detail, drill down from BC using the same tables and
            filters.
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Reusable KPI Card (local to this page)                                    */
/* -------------------------------------------------------------------------- */

type KpiCardProps = {
  label: string;
  value: number;
  hint?: string;
};

const KpiCard = ({ label, value, hint }: KpiCardProps) => (
  <div className="bg-card border border-border rounded-lg p-4 flex flex-col justify-between">
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{formatCurrency(value)}</div>
    </div>
    {hint && (
      <div className="mt-2 text-[10px] text-muted-foreground leading-snug">
        {hint}
      </div>
    )}
  </div>
);

export default Index;
