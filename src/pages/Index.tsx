import { useState, useEffect } from "react";
import {
  RefreshCw,
  Building2,
  TrendingUp,
  Users,
  Package,
  BarChart3,
  Wallet,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroHud } from "@/components/dashboard/HeroHud";
import { SectionShell } from "@/components/dashboard/SectionShell";
import { TopCustomersChart } from "@/components/dashboard/TopCustomersChart";
import { OverdueDonutChart } from "@/components/dashboard/OverdueDonutChart";
import { InventoryScatterChart } from "@/components/dashboard/InventoryScatterChart";
import { DrillDownPanel } from "@/components/dashboard/DrillDownPanel";
import { DataList } from "@/components/dashboard/DataList";
import { WaterfallChart } from "@/components/dashboard/WaterfallChart";
import { VendorChart } from "@/components/dashboard/VendorChart";
import {
  MdSnapshot,
  TopCustomer,
  InventoryItem,
  TopVendor,
  OverdueCustomer,
  OverdueVendor,
} from "@/types/dashboard";
import { formatCurrency, formatNumber } from "@/utils/format";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { SalesExplorer } from "@/components/dashboard/SalesExplorer";
import { ReceivablesAgingPanel } from "@/components/dashboard/ReceivablesAgingPanel";
import { PayablesAgingPanel } from "@/components/dashboard/PayablesAgingPanel";
import { CustomerTrendsPanel } from "@/components/dashboard/CustomerTrendsPanel";
import { VendorTrendsPanel } from "@/components/dashboard/VendorTrendsPanel";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const Index = () => {
  const [data, setData] = useState<MdSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Drill-down states
  const [selectedCustomer, setSelectedCustomer] = useState<TopCustomer | null>(
    null
  );
  const [selectedVendor, setSelectedVendor] = useState<TopVendor | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [showOverdueCustomers, setShowOverdueCustomers] = useState(false);
  const [showOverdueVendors, setShowOverdueVendors] = useState(false);

  const fetchData = async (showToast = false) => {
    try {
      setRefreshing(true);

      const res = await fetch(`${API_BASE_URL}/api/md/snapshot`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = (await res.json()) as MdSnapshot;
      setData(json);

      if (showToast) {
        toast({
          title: "Data Refreshed",
          description: "Dashboard data has been updated from Business Central.",
        });
      }
    } catch (error) {
      console.error(
        "Failed to fetch MD snapshot, falling back to mock data:",
        error
      );
      // Fallback so UI still works
      setData(mockData);

      toast({
        title: "Using sample data",
        description:
          "Could not reach the MD API, displaying mock data instead. Check the server/BC connection.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading || !data) {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="mx-auto w-[90%] max-w-[1600px] px-4 py-8">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8 bg-white p-6 rounded-xl shadow-sm border border-border"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {data.company.name}
              </h1>
              <p className="text-muted-foreground">
                centralized data analytics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <div className="text-muted-foreground">Last Updated</div>
              <div className="font-medium">
                {new Date(data.generatedAt).toLocaleString()}
              </div>
            </div>
            <Button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              variant="default"
              size="lg"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </motion.header>

        {/* Hero HUD */}
        <HeroHud data={data} />

        {/* Main Dashboard Sections */}
        <div className="space-y-8">
          {/* Detailed Sales View (direct from BC tables) */}
          <SectionShell
            title="Sales Register (Detail)"
            description="Shows recent posted sales invoices and headline sales KPIs (Today, MTD, YTD, Last 30 days). All numbers are computed from Business Central’s salesInvoices table via the /api/md/sales endpoint, summing totalAmountIncludingTax (or totalAmountExcludingTax where needed) by postingDate."
            icon={TrendingUp}
          >
            <SalesExplorer />
          </SectionShell>

          {/* Detailed AR ageing */}
          <SectionShell
            title="Receivables Ageing Detail"
            description="Customer-wise ageing of outstanding receivables. Buckets (1–30, 31–60, 60+ days) and totals are taken directly from the agedAccountsReceivables table in Business Central via /api/md/receivables-aging, using balanceDue and the period1/2/3Amount fields."
            icon={Wallet}
          >
            <ReceivablesAgingPanel />
          </SectionShell>

          {/* Detailed AP ageing */}
          <SectionShell
            title="Payables Ageing Detail"
            description="Vendor-wise ageing of outstanding payables. This view reads agedAccountsPayables via /api/md/payables-aging and shows balanceDue plus bucketed amounts (1–30, 31–60, 60+ days) per vendor to highlight overdue obligations."
            icon={ShoppingCart}
          >
            <PayablesAgingPanel />
          </SectionShell>

          {/* Customer trend view based on customerSales */}
          <SectionShell
            title="Customer Trend Analysis"
            description="Longer-term customer performance based on Business Central’s customerSales table via /api/md/customer-trends. Aggregates totalSalesAmount and quantities per customer to highlight key accounts and growth/decline trends."
            icon={Users}
          >
            <CustomerTrendsPanel />
          </SectionShell>

          {/* Vendor trend view based on vendorPurchases */}
          <SectionShell
            title="Vendor Spend Analysis"
            description="Vendor-wise purchase trends computed from the vendorPurchases table via /api/md/vendor-trends. Shows totalPurchaseAmount and related metrics so you can see which vendors account for most spend and exposure."
            icon={Package}
          >
            <VendorTrendsPanel />
          </SectionShell>

          {/* Commercial Pulse */}
          <SectionShell
            title="Commercial Pulse"
            description="High-level sales health and pipeline view. Uses aggregated metrics from the MD snapshot (/api/md/summary): salesInvoices for YTD/MTD/30-day sales and top customers, plus salesQuotes and salesOrders for open quote/order counts and values."
            icon={TrendingUp}
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <h3 className="text-lg font-semibold mb-4 text-foreground">
                  Top Customers by Sales
                </h3>
                <TopCustomersChart
                  customers={data.sales.topCustomersBySales}
                  onCustomerClick={setSelectedCustomer}
                />
              </div>

              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg border-2 border-success/20 shadow-sm">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Open Quotes
                  </h4>
                  <div className="text-2xl font-bold text-success">
                    {data.sales.openQuotesCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Value: ₹{(data.sales.openQuotesValue / 10000000).toFixed(2)}
                    Cr
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border-2 border-primary/20 shadow-sm">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Open Orders
                  </h4>
                  <div className="text-2xl font-bold text-primary">
                    {data.sales.openOrdersCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Value: ₹{(data.sales.openOrdersValue / 10000000).toFixed(2)}
                    Cr
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border-2 border-accent/20 shadow-sm">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    MTD Sales
                  </h4>
                  <div className="text-2xl font-bold text-accent">
                    ₹{(data.sales.mtdSales / 10000000).toFixed(2)}Cr
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border-2 border-info/20 shadow-sm">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Last 30 Days
                  </h4>
                  <div className="text-2xl font-bold text-info">
                    ₹{(data.sales.last30DaysSales / 10000000).toFixed(2)}Cr
                  </div>
                </div>
              </div>
            </div>
          </SectionShell>

          {/* Collections & Supplier Risk */}
          <SectionShell
            title="Collections & Supplier Risk"
            description="Summarizes receivables and payables risk. AR metrics come from agedAccountsReceivables and AP metrics from agedAccountsPayables via /api/md/summary, showing total vs overdue amounts and their share to flag collection and supplier-payment pressure."
            icon={Users}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Accounts Receivable</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOverdueCustomers(true)}
                  >
                    View Details
                  </Button>
                </div>
                <OverdueDonutChart
                  totalAmount={data.receivables.totalAR}
                  overdueAmount={data.receivables.overdueAR}
                  title="AR Breakdown"
                  color="hsl(var(--warning))"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Accounts Payable</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOverdueVendors(true)}
                  >
                    View Details
                  </Button>
                </div>
                <OverdueDonutChart
                  totalAmount={data.payables.totalAP}
                  overdueAmount={data.payables.overdueAP}
                  title="AP Breakdown"
                  color="hsl(var(--destructive))"
                />
              </div>
            </div>
          </SectionShell>

          {/* Vendor Analysis */}
          <SectionShell
            title="Vendor Analysis"
            description="Ranks vendors by total purchase value. Totals are computed in the MD snapshot from the purchaseInvoices table (unit + tax amounts) and exposed as topVendorsBySpend, helping identify key suppliers and concentration risk."
            icon={ShoppingCart}
          >
            <VendorChart
              vendors={data.purchases.topVendorsBySpend}
              onVendorClick={setSelectedVendor}
            />
          </SectionShell>

          {/* Inventory Universe */}
          <SectionShell
            title="Inventory Universe"
            description="Maps stock value vs movement. Inventory quantities and unitCost come from the items table, while 90-day sales movement is approximated from itemLedgerEntries (entryType = Sale). Both are aggregated server-side and served via /api/md/summary."
            icon={Package}
          >
            <InventoryScatterChart
              items={data.inventory.topItemsByInventoryValue}
              slowMovers={data.inventory.slowMovers}
              onItemClick={setSelectedItem}
            />
          </SectionShell>

          {/* Financial Summary */}
          <SectionShell
            title="Financial Performance"
            description="Summarized P&L, Balance Sheet, and Cash Flow. Data is pulled from Business Central’s incomeStatements, balanceSheets, and cashFlowStatements tables via /api/md/summary, then reduced to top-level lines (indentation 0–1) for a compact MD view."
            icon={BarChart3}
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4">
                Income Statement Flow
              </h3>
              <WaterfallChart data={data.finance.incomeStatementSummary} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              {/* Income Statement */}
              <div className="bg-white p-5 rounded-lg border-2 border-success/20 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-success">
                  Income Statement
                </h3>
                <div className="space-y-3">
                  {data.finance.incomeStatementSummary.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={`flex justify-between text-sm ${
                        line.lineType === "total"
                          ? "font-bold text-base border-t border-border pt-2 mt-2"
                          : ""
                      }`}
                      style={{ paddingLeft: `${line.indentation * 12}px` }}
                    >
                      <span
                        className={
                          line.lineType === "header" ? "font-semibold" : ""
                        }
                      >
                        {line.label}
                      </span>
                      <span
                        className={
                          line.amount < 0 ? "text-destructive" : "text-success"
                        }
                      >
                        ₹{Math.abs(line.amount / 10000000).toFixed(2)}Cr
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balance Sheet */}
              <div className="bg-white p-5 rounded-lg border-2 border-primary/20 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-primary">
                  Balance Sheet
                </h3>
                <div className="space-y-3">
                  {data.finance.balanceSheetSummary.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={`flex justify-between text-sm ${
                        line.lineType === "total"
                          ? "font-bold text-base border-t border-border pt-2 mt-2"
                          : ""
                      }`}
                      style={{ paddingLeft: `${line.indentation * 12}px` }}
                    >
                      <span
                        className={
                          line.lineType === "header" ? "font-semibold" : ""
                        }
                      >
                        {line.label}
                      </span>
                      <span>₹{(line.amount / 10000000).toFixed(2)}Cr</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cash Flow */}
              <div className="bg-white p-5 rounded-lg border-2 border-accent/20 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-accent">
                  Cash Flow
                </h3>
                <div className="space-y-3">
                  {data.finance.cashFlowSummary.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={`flex justify-between text-sm ${
                        line.lineType === "total"
                          ? "font-bold text-base border-t border-border pt-2 mt-2"
                          : ""
                      }`}
                    >
                      <span>{line.label}</span>
                      <span
                        className={
                          line.amount < 0 ? "text-destructive" : "text-success"
                        }
                      >
                        ₹{Math.abs(line.amount / 10000000).toFixed(2)}Cr
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionShell>
        </div>
      </div>

      {/* Drill-Down Panels */}
      <DrillDownPanel
        isOpen={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        title="Customer Details"
      >
        {selectedCustomer && (
          <div className="space-y-6">
            <div className="bg-primary/5 p-6 rounded-lg border border-primary/20">
              <h3 className="text-2xl font-bold text-foreground mb-2">
                {selectedCustomer.customerName}
              </h3>
              <p className="text-muted-foreground">
                Customer #{selectedCustomer.customerNumber}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">
                  Total Sales
                </div>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(selectedCustomer.totalSales)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">
                  Share of YTD Sales
                </div>
                <div className="text-2xl font-bold text-accent">
                  {(
                    (selectedCustomer.totalSales / data.sales.ytdSales) *
                    100
                  ).toFixed(1)}
                  %
                </div>
              </div>
            </div>

            {/* Check if customer has overdue amounts */}
            {data.receivables.topOverdueCustomers.find(
              (c) => c.customerNumber === selectedCustomer.customerNumber
            ) && (
              <div className="bg-warning/10 border border-warning/30 p-4 rounded-lg">
                <h4 className="font-semibold text-warning mb-2">
                  ⚠️ Overdue Amount
                </h4>
                <p className="text-sm text-muted-foreground">
                  This customer has outstanding overdue payments. Review in AR
                  details.
                </p>
              </div>
            )}

            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      {
                        name: selectedCustomer.customerName,
                        value: selectedCustomer.totalSales,
                      },
                      {
                        name: "Other Customers",
                        value:
                          data.sales.ytdSales - selectedCustomer.totalSales,
                      },
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    <Cell fill="hsl(var(--primary))" />
                    <Cell fill="hsl(var(--muted))" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </DrillDownPanel>

      <DrillDownPanel
        isOpen={!!selectedVendor}
        onClose={() => setSelectedVendor(null)}
        title="Vendor Details"
      >
        {selectedVendor && (
          <div className="space-y-6">
            <div className="bg-accent/5 p-6 rounded-lg border border-accent/20">
              <h3 className="text-2xl font-bold text-foreground mb-2">
                {selectedVendor.vendorName}
              </h3>
              <p className="text-muted-foreground">
                Vendor #{selectedVendor.vendorNumber}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">
                  Total Purchases
                </div>
                <div className="text-2xl font-bold text-accent">
                  {formatCurrency(selectedVendor.totalPurchases)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">
                  Share of YTD Purchases
                </div>
                <div className="text-2xl font-bold text-primary">
                  {(
                    (selectedVendor.totalPurchases /
                      data.purchases.ytdPurchases) *
                    100
                  ).toFixed(1)}
                  %
                </div>
              </div>
            </div>

            {data.payables.topOverdueVendors.find(
              (v) => v.vendorNumber === selectedVendor.vendorNumber
            ) && (
              <div className="bg-destructive/10 border border-destructive/30 p-4 rounded-lg">
                <h4 className="font-semibold text-destructive mb-2">
                  ⚠️ Overdue Payment
                </h4>
                <p className="text-sm text-muted-foreground">
                  Outstanding overdue payment to this vendor. Review in AP
                  details.
                </p>
              </div>
            )}
          </div>
        )}
      </DrillDownPanel>

      <DrillDownPanel
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        title="Inventory Item Details"
      >
        {selectedItem && (
          <div className="space-y-6">
            <div className="bg-success/5 p-6 rounded-lg border border-success/20">
              <h3 className="text-2xl font-bold text-foreground mb-2">
                {selectedItem.itemName}
              </h3>
              <p className="text-muted-foreground">
                Item #{selectedItem.itemNumber}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">
                  Inventory Value
                </div>
                <div className="text-2xl font-bold text-success">
                  {formatCurrency(selectedItem.inventoryValue)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">
                  Stock Quantity
                </div>
                <div className="text-2xl font-bold text-primary">
                  {formatNumber(selectedItem.inventoryQty)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">
                  Unit Cost
                </div>
                <div className="text-xl font-bold text-accent">
                  {formatCurrency(selectedItem.unitCost)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">
                  Sold (90 days)
                </div>
                <div className="text-xl font-bold text-info">
                  {formatNumber(selectedItem.soldQtyLast90)}
                </div>
              </div>
            </div>

            {data.inventory.slowMovers.find(
              (item) => item.itemNumber === selectedItem.itemNumber
            ) && (
              <div className="bg-warning/10 border border-warning/30 p-4 rounded-lg">
                <h4 className="font-semibold text-warning mb-2">
                  🐌 Slow Mover Alert
                </h4>
                <p className="text-sm text-muted-foreground">
                  This item has low sales velocity. Consider promotional
                  strategies or reviewing stock levels.
                </p>
              </div>
            )}

            <div className="bg-muted/30 p-4 rounded-lg">
              <h4 className="font-semibold mb-3">Performance Indicators</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Turnover Rate (90d)</span>
                  <span className="font-medium">
                    {(
                      (selectedItem.soldQtyLast90 / selectedItem.inventoryQty) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Days of Stock</span>
                  <span className="font-medium">
                    {selectedItem.soldQtyLast90 > 0
                      ? Math.round(
                          (selectedItem.inventoryQty /
                            selectedItem.soldQtyLast90) *
                            90
                        )
                      : "∞"}{" "}
                    days
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DrillDownPanel>

      <DrillDownPanel
        isOpen={showOverdueCustomers}
        onClose={() => setShowOverdueCustomers(false)}
        title="Overdue Customers"
      >
        <DataList
          data={data.receivables.topOverdueCustomers}
          columns={[
            { key: "customerName", label: "Customer", sortable: true },
            { key: "customerNumber", label: "Number", sortable: true },
            {
              key: "balanceDue",
              label: "Balance Due",
              sortable: true,
              align: "right",
              render: (value) => formatCurrency(value),
            },
            {
              key: "overdue",
              label: "Overdue",
              sortable: true,
              align: "right",
              render: (value) => (
                <span className="text-warning font-semibold">
                  {formatCurrency(value)}
                </span>
              ),
            },
            {
              key: "overdue",
              label: "% Overdue",
              align: "right",
              render: (value, item: OverdueCustomer) => (
                <span className="text-sm">
                  {((value / item.balanceDue) * 100).toFixed(1)}%
                </span>
              ),
            },
          ]}
          onRowClick={(customer) => {
            const fullCustomer = data.sales.topCustomersBySales.find(
              (c) => c.customerNumber === customer.customerNumber
            );
            if (fullCustomer) {
              setShowOverdueCustomers(false);
              setSelectedCustomer(fullCustomer);
            }
          }}
        />
      </DrillDownPanel>

      <DrillDownPanel
        isOpen={showOverdueVendors}
        onClose={() => setShowOverdueVendors(false)}
        title="Overdue Vendors"
      >
        <DataList
          data={data.payables.topOverdueVendors}
          columns={[
            { key: "vendorName", label: "Vendor", sortable: true },
            { key: "vendorNumber", label: "Number", sortable: true },
            {
              key: "balanceDue",
              label: "Balance Due",
              sortable: true,
              align: "right",
              render: (value) => formatCurrency(value),
            },
            {
              key: "overdue",
              label: "Overdue",
              sortable: true,
              align: "right",
              render: (value) => (
                <span className="text-destructive font-semibold">
                  {formatCurrency(value)}
                </span>
              ),
            },
            {
              key: "overdue",
              label: "% Overdue",
              align: "right",
              render: (value, item: OverdueVendor) => (
                <span className="text-sm">
                  {((value / item.balanceDue) * 100).toFixed(1)}%
                </span>
              ),
            },
          ]}
          onRowClick={(vendor) => {
            const fullVendor = data.purchases.topVendorsBySpend.find(
              (v) => v.vendorNumber === vendor.vendorNumber
            );
            if (fullVendor) {
              setShowOverdueVendors(false);
              setSelectedVendor(fullVendor);
            }
          }}
        />
      </DrillDownPanel>
    </div>
  );
};

export default Index;
