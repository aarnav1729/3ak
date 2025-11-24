import { useState, useEffect } from "react";
import { RefreshCw, Building2, TrendingUp, Users, Package, BarChart3, Wallet, ShoppingCart } from "lucide-react";
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
import { MdSnapshot, TopCustomer, InventoryItem, TopVendor, OverdueCustomer, OverdueVendor } from "@/types/dashboard";
import { formatCurrency, formatNumber } from "@/utils/format";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";

const mockData: MdSnapshot = {
  generatedAt: new Date().toISOString(),
  company: {
    name: "3AK Chemie Pvt. Ltd.",
  },
  sales: {
    todaySales: 2500000,
    mtdSales: 45000000,
    ytdSales: 350000000,
    last30DaysSales: 52000000,
    topCustomersBySales: [
      { customerNumber: "C001", customerName: "Acme Industries Ltd", totalSales: 45000000 },
      { customerNumber: "C002", customerName: "TechCorp Global", totalSales: 38000000 },
      { customerNumber: "C003", customerName: "MegaManufacturing Co", totalSales: 32000000 },
      { customerNumber: "C004", customerName: "Premium Chemicals", totalSales: 28000000 },
      { customerNumber: "C005", customerName: "National Suppliers", totalSales: 25000000 },
      { customerNumber: "C006", customerName: "Elite Distributors", totalSales: 22000000 },
      { customerNumber: "C007", customerName: "Global Trade Partners", totalSales: 18000000 },
      { customerNumber: "C008", customerName: "Industrial Solutions", totalSales: 15000000 },
      { customerNumber: "C009", customerName: "Quality Materials Inc", totalSales: 12000000 },
      { customerNumber: "C010", customerName: "Regional Traders", totalSales: 10000000 },
    ],
    openQuotesCount: 45,
    openQuotesValue: 15000000,
    openOrdersCount: 28,
    openOrdersValue: 22000000,
  },
  receivables: {
    totalAR: 85000000,
    overdueAR: 18000000,
    overdueRatioPercent: 21.2,
    topOverdueCustomers: [
      { customerNumber: "C012", customerName: "Slow Payer Industries", balanceDue: 5500000, overdue: 3200000, currencyCode: "INR" },
      { customerNumber: "C023", customerName: "Delayed Payments Corp", balanceDue: 4200000, overdue: 2800000, currencyCode: "INR" },
      { customerNumber: "C045", customerName: "Overdue Trading Ltd", balanceDue: 3800000, overdue: 2400000, currencyCode: "INR" },
      { customerNumber: "C067", customerName: "Late Payment Co", balanceDue: 3200000, overdue: 1900000, currencyCode: "INR" },
      { customerNumber: "C089", customerName: "Arrears Manufacturing", balanceDue: 2900000, overdue: 1700000, currencyCode: "INR" },
    ],
  },
  purchases: {
    mtdPurchases: 28000000,
    ytdPurchases: 245000000,
    last30DaysPurchases: 32000000,
    topVendorsBySpend: [
      { vendorNumber: "V001", vendorName: "Raw Materials Supplier Ltd", totalPurchases: 55000000 },
      { vendorNumber: "V002", vendorName: "Chemical Compounds Inc", totalPurchases: 42000000 },
      { vendorNumber: "V003", vendorName: "Industrial Equipment Co", totalPurchases: 35000000 },
      { vendorNumber: "V004", vendorName: "Packaging Solutions", totalPurchases: 28000000 },
      { vendorNumber: "V005", vendorName: "Logistics Partners", totalPurchases: 22000000 },
    ],
  },
  payables: {
    totalAP: 65000000,
    overdueAP: 12000000,
    overdueAPRatioPercent: 18.5,
    topOverdueVendors: [
      { vendorNumber: "V012", vendorName: "Equipment Leasing Corp", balanceDue: 4500000, overdue: 2800000, currencyCode: "INR" },
      { vendorNumber: "V023", vendorName: "Utility Services Ltd", balanceDue: 3200000, overdue: 2100000, currencyCode: "INR" },
      { vendorNumber: "V034", vendorName: "Maintenance Contractors", balanceDue: 2800000, overdue: 1800000, currencyCode: "INR" },
    ],
  },
  inventory: {
    totalSkus: 1250,
    totalInventoryQty: 125000,
    estInventoryValue: 180000000,
    topItemsByInventoryValue: [
      { itemNumber: "ITEM001", itemName: "Premium Chemical Compound A", inventoryQty: 5000, unitCost: 8000, inventoryValue: 40000000, soldQtyLast90: 3200 },
      { itemNumber: "ITEM002", itemName: "Industrial Grade Solvent B", inventoryQty: 8000, unitCost: 3500, inventoryValue: 28000000, soldQtyLast90: 5400 },
      { itemNumber: "ITEM003", itemName: "Specialty Catalyst C", inventoryQty: 3000, unitCost: 7500, inventoryValue: 22500000, soldQtyLast90: 1800 },
      { itemNumber: "ITEM004", itemName: "Base Chemical D", inventoryQty: 12000, unitCost: 1500, inventoryValue: 18000000, soldQtyLast90: 9800 },
      { itemNumber: "ITEM005", itemName: "Additive Mix E", inventoryQty: 6000, unitCost: 2800, inventoryValue: 16800000, soldQtyLast90: 4200 },
      { itemNumber: "ITEM006", itemName: "Coating Material F", inventoryQty: 4500, unitCost: 3200, inventoryValue: 14400000, soldQtyLast90: 2100 },
      { itemNumber: "ITEM007", itemName: "Polymer Base G", inventoryQty: 7000, unitCost: 1800, inventoryValue: 12600000, soldQtyLast90: 5600 },
      { itemNumber: "ITEM008", itemName: "Resin Compound H", inventoryQty: 3500, unitCost: 3400, inventoryValue: 11900000, soldQtyLast90: 1200 },
    ],
    slowMovers: [
      { itemNumber: "ITEM003", itemName: "Specialty Catalyst C", inventoryQty: 3000, unitCost: 7500, inventoryValue: 22500000, soldQtyLast90: 1800 },
      { itemNumber: "ITEM008", itemName: "Resin Compound H", inventoryQty: 3500, unitCost: 3400, inventoryValue: 11900000, soldQtyLast90: 1200 },
    ],
  },
  finance: {
    incomeStatementSummary: [
      { lineNumber: 1, label: "Total Income", amount: 350000000, lineType: "header", indentation: 0 },
      { lineNumber: 2, label: "Cost of Goods Sold", amount: -245000000, lineType: "detail", indentation: 1 },
      { lineNumber: 3, label: "Gross Profit", amount: 105000000, lineType: "total", indentation: 0 },
      { lineNumber: 4, label: "Operating Expenses", amount: -45000000, lineType: "detail", indentation: 1 },
      { lineNumber: 5, label: "Net Income", amount: 60000000, lineType: "total", indentation: 0 },
    ],
    balanceSheetSummary: [
      { lineNumber: 1, label: "Total Assets", amount: 580000000, lineType: "header", indentation: 0 },
      { lineNumber: 2, label: "Current Assets", amount: 280000000, lineType: "detail", indentation: 1 },
      { lineNumber: 3, label: "Fixed Assets", amount: 300000000, lineType: "detail", indentation: 1 },
      { lineNumber: 4, label: "Total Liabilities", amount: 280000000, lineType: "header", indentation: 0 },
      { lineNumber: 5, label: "Total Equity", amount: 300000000, lineType: "total", indentation: 0 },
    ],
    cashFlowSummary: [
      { lineNumber: 1, label: "Operating Cash Flow", amount: 55000000, lineType: "detail", indentation: 0 },
      { lineNumber: 2, label: "Investing Cash Flow", amount: -25000000, lineType: "detail", indentation: 0 },
      { lineNumber: 3, label: "Financing Cash Flow", amount: -15000000, lineType: "detail", indentation: 0 },
      { lineNumber: 4, label: "Cash at End of Period", amount: 85000000, lineType: "total", indentation: 0 },
    ],
  },
};

const Index = () => {
  const [data, setData] = useState<MdSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Drill-down states
  const [selectedCustomer, setSelectedCustomer] = useState<TopCustomer | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<TopVendor | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [showOverdueCustomers, setShowOverdueCustomers] = useState(false);
  const [showOverdueVendors, setShowOverdueVendors] = useState(false);

  const fetchData = async (showToast = false) => {
    try {
      setRefreshing(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setData(mockData);
      
      if (showToast) {
        toast({
          title: "Data Refreshed",
          description: "Dashboard data has been updated successfully.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch dashboard data.",
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
      <div className="container mx-auto px-4 py-8">
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
              <h1 className="text-3xl font-bold text-foreground">MD Control Tower</h1>
              <p className="text-muted-foreground">{data.company.name}</p>
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
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </motion.header>

        {/* Hero HUD */}
        <HeroHud data={data} />

        {/* Main Dashboard Sections */}
        <div className="space-y-8">
          {/* Commercial Pulse */}
          <SectionShell
            title="Commercial Pulse"
            description="Sales performance and customer insights"
            icon={TrendingUp}
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <h3 className="text-lg font-semibold mb-4 text-foreground">Top Customers by Sales</h3>
                <TopCustomersChart
                  customers={data.sales.topCustomersBySales}
                  onCustomerClick={setSelectedCustomer}
                />
              </div>

              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg border-2 border-success/20 shadow-sm">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Open Quotes</h4>
                  <div className="text-2xl font-bold text-success">
                    {data.sales.openQuotesCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Value: ₹{(data.sales.openQuotesValue / 10000000).toFixed(2)}Cr
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border-2 border-primary/20 shadow-sm">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Open Orders</h4>
                  <div className="text-2xl font-bold text-primary">
                    {data.sales.openOrdersCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Value: ₹{(data.sales.openOrdersValue / 10000000).toFixed(2)}Cr
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border-2 border-accent/20 shadow-sm">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">MTD Sales</h4>
                  <div className="text-2xl font-bold text-accent">
                    ₹{(data.sales.mtdSales / 10000000).toFixed(2)}Cr
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border-2 border-info/20 shadow-sm">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Last 30 Days</h4>
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
            description="Receivables and payables overview"
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
            description="Top vendors by purchase volume"
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
            description="Stock analysis and movement patterns"
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
            description="Income statement waterfall analysis"
            icon={BarChart3}
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4">Income Statement Flow</h3>
              <WaterfallChart data={data.finance.incomeStatementSummary} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              {/* Income Statement */}
              <div className="bg-white p-5 rounded-lg border-2 border-success/20 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-success">Income Statement</h3>
                <div className="space-y-3">
                  {data.finance.incomeStatementSummary.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={`flex justify-between text-sm ${
                        line.lineType === "total" ? "font-bold text-base border-t border-border pt-2 mt-2" : ""
                      }`}
                      style={{ paddingLeft: `${line.indentation * 12}px` }}
                    >
                      <span className={line.lineType === "header" ? "font-semibold" : ""}>
                        {line.label}
                      </span>
                      <span className={line.amount < 0 ? "text-destructive" : "text-success"}>
                        ₹{Math.abs(line.amount / 10000000).toFixed(2)}Cr
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balance Sheet */}
              <div className="bg-white p-5 rounded-lg border-2 border-primary/20 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-primary">Balance Sheet</h3>
                <div className="space-y-3">
                  {data.finance.balanceSheetSummary.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={`flex justify-between text-sm ${
                        line.lineType === "total" ? "font-bold text-base border-t border-border pt-2 mt-2" : ""
                      }`}
                      style={{ paddingLeft: `${line.indentation * 12}px` }}
                    >
                      <span className={line.lineType === "header" ? "font-semibold" : ""}>
                        {line.label}
                      </span>
                      <span>₹{(line.amount / 10000000).toFixed(2)}Cr</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cash Flow */}
              <div className="bg-white p-5 rounded-lg border-2 border-accent/20 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-accent">Cash Flow</h3>
                <div className="space-y-3">
                  {data.finance.cashFlowSummary.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={`flex justify-between text-sm ${
                        line.lineType === "total" ? "font-bold text-base border-t border-border pt-2 mt-2" : ""
                      }`}
                    >
                      <span>{line.label}</span>
                      <span className={line.amount < 0 ? "text-destructive" : "text-success"}>
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
              <p className="text-muted-foreground">Customer #{selectedCustomer.customerNumber}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">Total Sales</div>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(selectedCustomer.totalSales)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">Share of YTD Sales</div>
                <div className="text-2xl font-bold text-accent">
                  {((selectedCustomer.totalSales / data.sales.ytdSales) * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Check if customer has overdue amounts */}
            {data.receivables.topOverdueCustomers.find(
              (c) => c.customerNumber === selectedCustomer.customerNumber
            ) && (
              <div className="bg-warning/10 border border-warning/30 p-4 rounded-lg">
                <h4 className="font-semibold text-warning mb-2">⚠️ Overdue Amount</h4>
                <p className="text-sm text-muted-foreground">
                  This customer has outstanding overdue payments. Review in AR details.
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
                        value: data.sales.ytdSales - selectedCustomer.totalSales,
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
              <p className="text-muted-foreground">Vendor #{selectedVendor.vendorNumber}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">Total Purchases</div>
                <div className="text-2xl font-bold text-accent">
                  {formatCurrency(selectedVendor.totalPurchases)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">Share of YTD Purchases</div>
                <div className="text-2xl font-bold text-primary">
                  {((selectedVendor.totalPurchases / data.purchases.ytdPurchases) * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {data.payables.topOverdueVendors.find(
              (v) => v.vendorNumber === selectedVendor.vendorNumber
            ) && (
              <div className="bg-destructive/10 border border-destructive/30 p-4 rounded-lg">
                <h4 className="font-semibold text-destructive mb-2">⚠️ Overdue Payment</h4>
                <p className="text-sm text-muted-foreground">
                  Outstanding overdue payment to this vendor. Review in AP details.
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
              <p className="text-muted-foreground">Item #{selectedItem.itemNumber}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">Inventory Value</div>
                <div className="text-2xl font-bold text-success">
                  {formatCurrency(selectedItem.inventoryValue)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">Stock Quantity</div>
                <div className="text-2xl font-bold text-primary">
                  {formatNumber(selectedItem.inventoryQty)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">Unit Cost</div>
                <div className="text-xl font-bold text-accent">
                  {formatCurrency(selectedItem.unitCost)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">Sold (90 days)</div>
                <div className="text-xl font-bold text-info">
                  {formatNumber(selectedItem.soldQtyLast90)}
                </div>
              </div>
            </div>

            {data.inventory.slowMovers.find((item) => item.itemNumber === selectedItem.itemNumber) && (
              <div className="bg-warning/10 border border-warning/30 p-4 rounded-lg">
                <h4 className="font-semibold text-warning mb-2">🐌 Slow Mover Alert</h4>
                <p className="text-sm text-muted-foreground">
                  This item has low sales velocity. Consider promotional strategies or reviewing stock levels.
                </p>
              </div>
            )}

            <div className="bg-muted/30 p-4 rounded-lg">
              <h4 className="font-semibold mb-3">Performance Indicators</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Turnover Rate (90d)</span>
                  <span className="font-medium">
                    {((selectedItem.soldQtyLast90 / selectedItem.inventoryQty) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Days of Stock</span>
                  <span className="font-medium">
                    {selectedItem.soldQtyLast90 > 0
                      ? Math.round((selectedItem.inventoryQty / selectedItem.soldQtyLast90) * 90)
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
                <span className="text-warning font-semibold">{formatCurrency(value)}</span>
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
                <span className="text-destructive font-semibold">{formatCurrency(value)}</span>
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
