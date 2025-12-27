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
import Layout from "@/components/Layout";

import staticSnapshot from "@/../server/md-dashboard-snapshot.json";

const STATIC_SNAPSHOT = staticSnapshot as MdSnapshot;

// Treat backend as optional: NO default URL
//const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || undefined;

const API_BASE_URL = "https://threeakchemie.onrender.com";

/*  Types                                                                     */
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
  packageType?: string;

  // From "Product Categories for FG" sheet
  masterCategory?: string;
  category?: string;
  subCategory?: string;
  productBaseName?: string;
};

type SalesCustomerSkuRow = {
  customerNumber: string;
  customerName: string;
  itemNumber: string;
  description: string;
  totalSales: number;
  totalQuantity: number;

  // From SKU classification
  packageType?: string;
  masterCategory?: string;
  category?: string;
  subCategory?: string;
  productBaseName?: string;
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

// 🔹 New: invoice-level fact row used for multi-filtering
type SalesFactRow = {
  postingDate: string; // ISO
  year: number;
  month: number; // 1–12
  monthId: string; // "YYYY-MM"
  monthLabel: string; // e.g. "Apr 2025"
  fyId: string;
  fyLabel: string;
  customerNumber: string;
  customerName: string;
  geo: string; // "Domestic" | "Export"
  salesCategoryKey: string;
  salesCategoryLabel: string;
  amount: number; // incl. tax
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
  facts?: SalesFactRow[]; // 🔹 OPTIONAL: populated by new API
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

/* 🔹 NEW: Summary table row types */
type FiscalYearSummaryRow = {
  fyId: string;
  fyLabel: string;
  totalSales: number;
};

type FiscalQuarterSummaryRow = {
  quarterId: string;
  fyLabel: string;
  quarterLabel: string;
  totalSales: number;
};

type GeoSummaryRow = {
  geo: ChannelRootGroup;
  label: string;
  totalSales: number;
  invoiceCount: number;
};

function getChannelRootGroup(row: SalesChannelRow): ChannelRootGroup {
  // Adjust this logic if your labels differ; for now:
  // anything with "export" in the label is Export, everything else is Domestic
  const label = row.channelLabel.toLowerCase();
  return label.includes("export") ? "Export" : "Domestic";
}

/* ------------------------ Group Company Mapping --------------------------- */

type GroupCompany = {
  customerNumber: string;
  customerName: string;
};

const GROUP_COMPANIES: GroupCompany[] = [
  {
    customerNumber: "CUST-0279",
    customerName: "3AK CHEMIE SOUTH AFRICA PTY LTD",
  },
  {
    customerNumber: "CUST-0280",
    customerName: "3AK CHEMIE AUSTRALIA PTY LTD",
  },
  {
    customerNumber: "CUST-0289",
    customerName: "3AK CHEMIE SINGAPORE PTE. LTD.",
  },
  {
    customerNumber: "CUST-0316",
    customerName: "3AK CHEMIE JAPAN KK",
  },
  {
    customerNumber: "CUST-0320",
    customerName: "3AK CHEMIE (THAILAND) CO., LTD.",
  },
  {
    customerNumber: "CUST-0350",
    customerName: "3AK Unit-1 R&D dept",
  },
  {
    customerNumber: "CUST-0395",
    customerName: "3AK CHEMIE MALAYSIA SDN. BHD.",
  },
  {
    customerNumber: "CUST-0399",
    customerName: "3AK CHEMIE VIETNAM COMPANY LIMITED",
  },
  {
    customerNumber: "CUST-0401",
    customerName: "3AK CHEMIE HONG KONG LIMITED",
  },
  {
    customerNumber: "CUST-0422",
    customerName: "3AK CHEMIE TUNISIA",
  },
  {
    customerNumber: "CUST-0429",
    customerName: "3AK CHEMIE PHILIPPINES PTE. LTD., INC.",
  },
  {
    customerNumber: "CUST-0458",
    customerName: "3AK CHEMIE NIGERIA LIMITED",
  },
  {
    customerNumber: "CUST-0470",
    customerName: "PT THREEAK CHEMIE INDONESIA",
  },
  {
    customerNumber: "CUST-0536",
    customerName: "3AK CHEMIE USA LLC",
  },
];

/* 🔹 NEW: Fiscal helpers for FE (Apr–Mar FY) */
const twoDigit = (n: number) => String(n).slice(-2);

function getFiscalYearMeta(year: number, month: number) {
  // month = 1–12; Apr (4) is FY start
  const fyStartYear = month <= 3 ? year - 1 : year;
  const fyEndYear = fyStartYear + 1;
  const fyId = `${fyStartYear}-${fyEndYear}`;
  const fyLabel = `FY ${fyStartYear}-${fyEndYear}`;
  return { fyId, fyLabel, fyStartYear, fyEndYear };
}

function getFiscalQuarterMeta(year: number, month: number) {
  const { fyId, fyLabel } = getFiscalYearMeta(year, month);

  let quarter = 4;
  if (month >= 4 && month <= 6) quarter = 1;
  else if (month >= 7 && month <= 9) quarter = 2;
  else if (month >= 10 && month <= 12) quarter = 3;
  // Jan–Mar => Q4 (already default)

  const quarterId = `${fyId}-Q${quarter}`;
  const quarterLabel = `Q${quarter} ${fyLabel}`;
  return { quarterId, quarterLabel, fyLabel };
}

/*  Helper: Month-over-Month series (Jan–Dec x-axis, 1 line per year)        */
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

/*  Main Component                                                            */

type BreakdownMode =
  | "fy"
  | "quarter"
  | "company"
  | "customer"
  | "sku"
  | "geo"
  | "month";

const Index = () => {
  const [sales, setSales] = useState<SalesAnalytics | null>(
    STATIC_SNAPSHOT?.salesAnalytics ?? null
  );
  const [inventory, setInventory] = useState<InventoryAnalytics | null>(
    STATIC_SNAPSHOT?.inventoryAnalytics ?? null
  );
  const [vendorAging, setVendorAging] = useState<VendorAgingAnalytics | null>(
    STATIC_SNAPSHOT?.vendorAgingAnalytics ?? null
  );

  // We’re *not* blocking on the network anymore – we already have snapshot
  const [loading, setLoading] = useState(false);

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

  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>("fy");

  // 🔹 Filters for Sales Summary (Company × Month)
  const [summaryFilterCompany, setSummaryFilterCompany] = useState<
    string | "ALL"
  >("ALL");
  const [summaryFilterMonthId, setSummaryFilterMonthId] = useState<
    string | "ALL"
  >("ALL");

  // Drilldown state for "Sales by Customer" → SKU donut
  const [selectedCustomer, setSelectedCustomer] =
    useState<SalesCustomerRow | null>(null);

  const customerSkuRows: SalesCustomerSkuRow[] =
    selectedCustomer && sales!.salesByCustomerSku
      ? sales!.salesByCustomerSku.filter(
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
    selectedSegmentKey && sales!.salesByChannelInvoices
      ? sales!.salesByChannelInvoices.filter(
          (row) => row.channelKey === selectedSegmentKey
        )
      : [];

  const loadAll = async (showToast = false) => {
    if (!API_BASE_URL) {
      console.info(
        "[MD] No VITE_API_BASE_URL configured – running in snapshot-only mode."
      );
      return;
    }

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
          "Could not load analytics from the MD API. Showing last bundled snapshot instead.",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // We already have STATIC_SNAPSHOT rendered.
    // If a backend URL exists, fire a background refresh once.
    if (!API_BASE_URL) {
      console.info("[MD] Snapshot-only mode, skipping live bootstrap.");
      return;
    }

    loadAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilters = () => {
    loadAll(true);
  };

  if (loading || !sales || !inventory || !vendorAging) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white border border-border rounded-xl px-6 py-4 shadow-sm text-sm text-muted-foreground">
          Loading analytics dashboard…
        </div>
      </div>
    );
  }

  // 🔹 Multi-filter source facts from backend (if available)
  const factRows: SalesFactRow[] = Array.isArray((sales as any).facts)
    ? ((sales as any).facts as SalesFactRow[])
    : [];

  const availableCompanyOptions =
    factRows.length > 0
      ? GROUP_COMPANIES.filter((gc) =>
          factRows.some((f) => f.customerNumber === gc.customerNumber)
        ).map((gc) => ({
          value: gc.customerNumber,
          label: `${gc.customerName} (${gc.customerNumber})`,
        }))
      : [];

  const availableMonthOptions =
    factRows.length > 0
      ? Array.from(
          factRows.reduce((acc, f) => {
            if (!acc.has(f.monthId)) {
              acc.set(f.monthId, f.monthLabel);
            }
            return acc;
          }, new Map<string, string>())
        )
          .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
          .map(([value, label]) => ({ value, label }))
      : [];

  const filteredFacts: SalesFactRow[] =
    factRows.length === 0
      ? []
      : factRows.filter((f) => {
          if (
            summaryFilterCompany !== "ALL" &&
            f.customerNumber !== summaryFilterCompany
          ) {
            return false;
          }
          if (
            summaryFilterMonthId !== "ALL" &&
            f.monthId !== summaryFilterMonthId
          ) {
            return false;
          }
          return true;
        });

  const hasSummaryFilters =
    summaryFilterCompany !== "ALL" || summaryFilterMonthId !== "ALL";

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

  // ------------------- Sales by Customer histogram (Top 25 only) -------------
  const MAX_TOP_CUSTOMERS = 25;

  const sortedCustomers = [...(sales.salesByCustomer || [])].sort(
    (a, b) => b.totalSales - a.totalSales
  );

  const customerHistogramData: SalesCustomerRow[] = sortedCustomers.slice(
    0,
    MAX_TOP_CUSTOMERS
  );

  // 🔹 New: Group company sales histogram source
  type GroupCompanySalesRow = {
    customerNumber: string;
    customerName: string;
    totalSales: number;
  };

  const groupCompanySalesData: GroupCompanySalesRow[] = GROUP_COMPANIES.map(
    (gc) => {
      const match = sales.salesByCustomer.find(
        (row) => row.customerNumber === gc.customerNumber
      );

      return {
        customerNumber: gc.customerNumber,
        customerName: gc.customerName,
        totalSales: match?.totalSales ?? 0,
      };
    }
  ).filter((row) => row.totalSales > 0);

  /* 🔹 NEW: Summary datasets for the pivot table (all range-limited + filterable) */

  // FY summary (Apr–Mar)
  const fiscalYearSummaryRows: FiscalYearSummaryRow[] = (() => {
    // If no facts (old snapshot), fall back to monthlyHistogram
    if (filteredFacts.length === 0) {
      const map = new Map<string, FiscalYearSummaryRow>();

      (sales.monthlyHistogram || []).forEach((m) => {
        const { fyId, fyLabel } = getFiscalYearMeta(m.year, m.month);
        const existing =
          map.get(fyId) ||
          ({
            fyId,
            fyLabel,
            totalSales: 0,
          } as FiscalYearSummaryRow);

        existing.totalSales += m.totalSales || 0;
        map.set(fyId, existing);
      });

      return Array.from(map.values()).sort((a, b) =>
        a.fyId < b.fyId ? -1 : a.fyId > b.fyId ? 1 : 0
      );
    }

    const map = new Map<string, FiscalYearSummaryRow>();

    filteredFacts.forEach((f) => {
      const { fyId, fyLabel } = getFiscalYearMeta(f.year, f.month);
      const existing =
        map.get(fyId) ||
        ({
          fyId,
          fyLabel,
          totalSales: 0,
        } as FiscalYearSummaryRow);

      existing.totalSales += f.amount || 0;
      map.set(fyId, existing);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.fyId < b.fyId ? -1 : a.fyId > b.fyId ? 1 : 0
    );
  })();

  // Fiscal quarter summary
  const fiscalQuarterSummaryRows: FiscalQuarterSummaryRow[] = (() => {
    if (filteredFacts.length === 0) {
      const map = new Map<string, FiscalQuarterSummaryRow>();

      (sales.monthlyHistogram || []).forEach((m) => {
        const { quarterId, quarterLabel, fyLabel } = getFiscalQuarterMeta(
          m.year,
          m.month
        );

        const existing =
          map.get(quarterId) ||
          ({
            quarterId,
            fyLabel,
            quarterLabel,
            totalSales: 0,
          } as FiscalQuarterSummaryRow);

        existing.totalSales += m.totalSales || 0;
        map.set(quarterId, existing);
      });

      return Array.from(map.values()).sort((a, b) =>
        a.quarterId < b.quarterId ? -1 : a.quarterId > b.quarterId ? 1 : 0
      );
    }

    const map = new Map<string, FiscalQuarterSummaryRow>();

    filteredFacts.forEach((f) => {
      const { quarterId, quarterLabel, fyLabel } = getFiscalQuarterMeta(
        f.year,
        f.month
      );

      const existing =
        map.get(quarterId) ||
        ({
          quarterId,
          fyLabel,
          quarterLabel,
          totalSales: 0,
        } as FiscalQuarterSummaryRow);

      existing.totalSales += f.amount || 0;
      map.set(quarterId, existing);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.quarterId < b.quarterId ? -1 : a.quarterId > b.quarterId ? 1 : 0
    );
  })();

  // Domestic vs Export summary (filter-aware)
  const geoSummaryRows: GeoSummaryRow[] = (() => {
    if (filteredFacts.length === 0) {
      return channelTopData.map((row) => ({
        geo: row.key,
        label: row.label,
        totalSales: row.totalSales,
        invoiceCount: row.invoiceCount,
      }));
    }

    const map = new Map<ChannelRootGroup, GeoSummaryRow>();

    filteredFacts.forEach((f) => {
      const g =
        f.geo === "Export"
          ? ("Export" as ChannelRootGroup)
          : ("Domestic" as ChannelRootGroup);

      const existing =
        map.get(g) ||
        ({
          geo: g,
          label: g,
          totalSales: 0,
          invoiceCount: 0,
        } as GeoSummaryRow);

      existing.totalSales += f.amount || 0;
      existing.invoiceCount += 1;
      map.set(g, existing);
    });

    return Array.from(map.values());
  })();

  // Top SKUs (range-limited) – unchanged (SKU-level filters not wired to facts)
  const MAX_TOP_SKU = 25;
  const topSkuSummaryRows: SalesSkuRow[] = [...(sales.salesBySku || [])]
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, MAX_TOP_SKU);

  // Company summary (Group companies only; filter-aware)
  const companySummaryRows: GroupCompanySalesRow[] = (() => {
    if (filteredFacts.length === 0) {
      return groupCompanySalesData;
    }

    const groupCompanySet = new Set(
      GROUP_COMPANIES.map((gc) => gc.customerNumber)
    );

    const map = new Map<string, GroupCompanySalesRow>();

    filteredFacts.forEach((f) => {
      if (!groupCompanySet.has(f.customerNumber)) return;

      const existing =
        map.get(f.customerNumber) ||
        ({
          customerNumber: f.customerNumber,
          customerName: f.customerName,
          totalSales: 0,
        } as GroupCompanySalesRow);

      existing.totalSales += f.amount || 0;
      map.set(f.customerNumber, existing);
    });

    const rows = Array.from(map.values());
    rows.sort((a, b) => b.totalSales - a.totalSales);
    return rows;
  })();

  // Month summary (filter-aware)
  const monthlySummaryRows: SalesMonthlyPoint[] = (() => {
    if (filteredFacts.length === 0) {
      return sales.monthlyHistogram || [];
    }

    const map = new Map<string, SalesMonthlyPoint>();

    filteredFacts.forEach((f) => {
      const key = f.monthId;
      const existing =
        map.get(key) ||
        ({
          year: f.year,
          month: f.month,
          label: f.monthLabel,
          totalSales: 0,
        } as SalesMonthlyPoint);

      existing.totalSales += f.amount || 0;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );
  })();

  const totalRangeSales =
    filteredFacts.length > 0
      ? filteredFacts.reduce((sum, f) => sum + (f.amount || 0), 0)
      : sales.kpis.totalSalesInRange || 0;

  /*  Render                                                                  */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Layout
        className="bg-gradient-to-br from-slate-50 to-slate-100"
        containerClassName="max-w-none px-0 py-0"
      >
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
                    Grouped by:{" "}
                    <span className="font-medium">{granularity}</span>
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
                    className={`w-4 h-4 mr-2 ${
                      refreshing ? "animate-spin" : ""
                    }`}
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
                    selected date range. Calculated by aggregating invoice
                    amounts in salesInvoice by posting month.
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
                                  barYearColors[entry.year] ||
                                  barColorPalette[0]
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
              {/* Group Company Sales Histogram */}
              <div className="bg-card rounded-lg border border-border p-4 mb-6">
                <h3 className="text-sm font-semibold mb-1">
                  Group Company Sales
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Total sales to internal group companies (intercompany
                  entities) within the selected date range. Uses the hard-coded
                  list of group company customer numbers and sums their invoice
                  values from the sales analytics endpoint.
                </p>

                <div className="h-72">
                  {groupCompanySalesData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                      No group company sales found for the selected range.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={groupCompanySalesData}
                        barCategoryGap="40%"
                      >
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
                          formatter={(v: any) => [
                            `${formatCurrency(Number(v))} (₹)`,
                            "Sales",
                          ]}
                          labelFormatter={(label, payload) => {
                            const row = payload?.[0]?.payload as
                              | GroupCompanySalesRow
                              | undefined;
                            if (!row) return label;
                            return `${row.customerName} (${row.customerNumber})`;
                          }}
                        />
                        <Legend />
                        <Bar dataKey="totalSales" name="Sales (₹)" barSize={16}>
                          {groupCompanySalesData.map((entry, index) => (
                            <Cell
                              key={`gc-bar-${entry.customerNumber}-${index}`}
                              fill={
                                barColorPalette[index % barColorPalette.length]
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* 🔹 NEW: Sales Summary Table (below intercompany chart) */}
              <div className="bg-card rounded-lg border border-border p-4 mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Sales Summary (Multi-view Table)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      One compact table where you can flip between views:
                      Fiscal-year, quarter, company, customer, SKU, geo
                      (domestic/export), and month — all computed over the
                      selected date range.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 md:justify-end mt-2 md:mt-0">
                    {[
                      { key: "fy", label: "By FY" },
                      { key: "quarter", label: "By Quarter" },
                      { key: "company", label: "By Company" },
                      { key: "customer", label: "By Customer" },
                      { key: "sku", label: "By SKU" },
                      { key: "geo", label: "Domestic / Export" },
                      { key: "month", label: "By Month" },
                    ].map((mode) => (
                      <Button
                        key={mode.key}
                        size="xs"
                        variant={
                          breakdownMode === (mode.key as BreakdownMode)
                            ? "default"
                            : "outline"
                        }
                        onClick={() =>
                          setBreakdownMode(mode.key as BreakdownMode)
                        }
                        className="text-[11px] px-2 py-1"
                      >
                        {mode.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* 🔹 Company × Month filters for summary table */}
                <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px]">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Company</span>
                    <select
                      className="border rounded-md px-2 py-1 bg-background"
                      value={summaryFilterCompany}
                      onChange={(e) =>
                        setSummaryFilterCompany(
                          (e.target.value || "ALL") as string | "ALL"
                        )
                      }
                      disabled={availableCompanyOptions.length === 0}
                    >
                      <option value="ALL">All group companies</option>
                      {availableCompanyOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Month</span>
                    <select
                      className="border rounded-md px-2 py-1 bg-background"
                      value={summaryFilterMonthId}
                      onChange={(e) =>
                        setSummaryFilterMonthId(
                          (e.target.value || "ALL") as string | "ALL"
                        )
                      }
                      disabled={availableMonthOptions.length === 0}
                    >
                      <option value="ALL">All months</option>
                      {availableMonthOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {hasSummaryFilters && (
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => {
                        setSummaryFilterCompany("ALL");
                        setSummaryFilterMonthId("ALL");
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>

                {/* Actual table body */}
                {breakdownMode === "fy" && (
                  <DataList<FiscalYearSummaryRow>
                    data={fiscalYearSummaryRows}
                    columns={[
                      {
                        key: "fyLabel",
                        label: "Fiscal Year",
                        sortable: true,
                      },
                      {
                        key: "totalSales",
                        label: "Sales (₹)",
                        sortable: true,
                        render: (v) => formatCurrency(v),
                        align: "right",
                      },
                    ]}
                    maxHeight={260}
                  />
                )}

                {breakdownMode === "quarter" && (
                  <DataList<FiscalQuarterSummaryRow>
                    data={fiscalQuarterSummaryRows}
                    columns={[
                      {
                        key: "fyLabel",
                        label: "Fiscal Year",
                        sortable: true,
                      },
                      {
                        key: "quarterLabel",
                        label: "Quarter",
                        sortable: true,
                      },
                      {
                        key: "totalSales",
                        label: "Sales (₹)",
                        sortable: true,
                        render: (v) => formatCurrency(v),
                        align: "right",
                      },
                    ]}
                    maxHeight={260}
                  />
                )}

                {breakdownMode === "company" && (
                  <DataList<GroupCompanySalesRow>
                    data={companySummaryRows}
                    columns={[
                      {
                        key: "customerName",
                        label: "Group Company",
                        sortable: true,
                      },
                      {
                        key: "customerNumber",
                        label: "Code",
                        sortable: true,
                      },
                      {
                        key: "totalSales",
                        label: "Sales (₹)",
                        sortable: true,
                        render: (v) => formatCurrency(v),
                        align: "right",
                      },
                    ]}
                    maxHeight={260}
                  />
                )}

                {breakdownMode === "customer" && (
                  <DataList<SalesCustomerRow>
                    data={customerHistogramData}
                    columns={[
                      {
                        key: "customerName",
                        label: "Customer (Top 25)",
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
                    maxHeight={260}
                  />
                )}

                {breakdownMode === "sku" && (
                  <DataList<SalesSkuRow>
                    data={topSkuSummaryRows}
                    columns={[
                      {
                        key: "itemNumber",
                        label: "Item (Top 25)",
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
                    maxHeight={260}
                  />
                )}

                {breakdownMode === "geo" && (
                  <DataList<GeoSummaryRow>
                    data={geoSummaryRows}
                    columns={[
                      {
                        key: "label",
                        label: "Segment",
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
                    maxHeight={260}
                  />
                )}

                {breakdownMode === "month" && (
                  <DataList<SalesMonthlyPoint>
                    data={monthlySummaryRows}
                    columns={[
                      {
                        key: "label",
                        label: "Month",
                        sortable: true,
                      },
                      {
                        key: "year",
                        label: "Year",
                        sortable: true,
                      },
                      {
                        key: "totalSales",
                        label: "Sales (₹)",
                        sortable: true,
                        render: (v) => formatCurrency(v),
                        align: "right",
                      },
                    ]}
                    maxHeight={260}
                  />
                )}

                <div className="mt-2 text-[11px] text-muted-foreground">
                  All values use invoice amount including tax within the
                  selected From–To range. Switch the view using the chips above
                  to pivot quickly without leaving this section.
                </div>
              </div>

              {/* Sales by Customer Histogram (Top 25 + drilldown) */}
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
                      <BarChart
                        data={customerHistogramData}
                        barCategoryGap="40%"
                      >
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
                              if (!row) {
                                return [`${formatCurrency(Number(v))} (₹)`, ""];
                              }

                              if (row.itemNumber === "OTHERS") {
                                return [
                                  `${formatCurrency(Number(v))} (₹)`,
                                  "Others (tail SKUs)",
                                ];
                              }

                              const parts: string[] = [row.itemNumber];

                              if (row.productBaseName) {
                                parts.push(row.productBaseName);
                              } else if (row.category) {
                                parts.push(row.category);
                              } else if (row.masterCategory) {
                                parts.push(row.masterCategory);
                              }

                              if (row.packageType) {
                                parts.push(`Pack: ${row.packageType}`);
                              }

                              const label = parts.join(" – ");

                              return [
                                `${formatCurrency(Number(v))} (₹)`,
                                label,
                              ];
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
                    within the selected date range. Shows total billing and
                    count of invoices per customer.
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
                    Uses salesInvoiceLine joined to its parent invoice to
                    compute per-SKU quantities and values across the selected
                    date range. Line amounts are based on lineAmount /
                    amountIncludingTax.
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
                        key: "masterCategory",
                        label: "Master Category",
                        sortable: true,
                      },
                      {
                        key: "category",
                        label: "Category",
                        sortable: true,
                      },
                      {
                        key: "packageType",
                        label: "Package Type",
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
                  level, click a slice again to reveal the detailed channel
                  table below the chart.
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
                                    barColorPalette[
                                      idx % barColorPalette.length
                                    ]
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
                    <div className="text-xs text-muted-foreground">
                      {b.label}
                    </div>
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
                    movement date derived from itemLedgerEntry (purchase,
                    output, positive adjustment, or transfer in) versus today.
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
                  against SFG and FG (codes starting with 2511) produced over
                  the selected date range. Classification is based on item’s
                  itemCategoryCode, inventoryPostingGroup, genProdPostingGroup,
                  and code prefixes and can be adjusted in md.cjs. Quantities
                  and values are aggregated from itemLedgerEntry.quantity and
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
                        formatter={(v: any) =>
                          `${formatCurrency(Number(v))} (₹)`
                        }
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
              All values are read-only snapshots from Business Central. For
              exact transactional detail, drill down from BC using the same
              tables and filters.
            </div>
          </div>
        </div>
      </Layout>
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
