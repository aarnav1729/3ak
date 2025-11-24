import { useState, useEffect } from "react";
import { RefreshCw, Building2, TrendingUp, Users, Package, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroHud } from "@/components/dashboard/HeroHud";
import { SectionShell } from "@/components/dashboard/SectionShell";
import { TopCustomersChart } from "@/components/dashboard/TopCustomersChart";
import { OverdueDonutChart } from "@/components/dashboard/OverdueDonutChart";
import { InventoryScatterChart } from "@/components/dashboard/InventoryScatterChart";
import { MdSnapshot } from "@/types/dashboard";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";

// Mock data for development
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

  const fetchData = async (showToast = false) => {
    try {
      setRefreshing(true);
      
      // Simulate API call with mock data for now
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
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Background constellation effect */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-primary rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0.2, 0.8, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: 2 + Math.random() * 3,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl glass-panel border border-primary/30">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-glow">MD Control Tower</h1>
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
              className="glass-panel border-primary/30 hover:border-primary/50"
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
                <h3 className="text-lg font-semibold mb-4">Top Customers by Sales</h3>
                <TopCustomersChart
                  customers={data.sales.topCustomersBySales}
                  onCustomerClick={(customer) => {
                    toast({
                      title: customer.customerName,
                      description: `Customer #${customer.customerNumber} - Total Sales: ₹${(customer.totalSales / 10000000).toFixed(2)}Cr`,
                    });
                  }}
                />
              </div>

              <div className="space-y-4">
                <div className="glass-panel p-4 rounded-lg border border-success/30">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Open Quotes</h4>
                  <div className="text-2xl font-bold text-success">
                    {data.sales.openQuotesCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Value: ₹{(data.sales.openQuotesValue / 10000000).toFixed(2)}Cr
                  </div>
                </div>

                <div className="glass-panel p-4 rounded-lg border border-primary/30">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Open Orders</h4>
                  <div className="text-2xl font-bold text-primary">
                    {data.sales.openOrdersCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Value: ₹{(data.sales.openOrdersValue / 10000000).toFixed(2)}Cr
                  </div>
                </div>

                <div className="glass-panel p-4 rounded-lg border border-accent/30">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">MTD Sales</h4>
                  <div className="text-2xl font-bold text-accent">
                    ₹{(data.sales.mtdSales / 10000000).toFixed(2)}Cr
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
              <OverdueDonutChart
                totalAmount={data.receivables.totalAR}
                overdueAmount={data.receivables.overdueAR}
                title="Accounts Receivable"
                color="hsl(var(--warning))"
              />
              <OverdueDonutChart
                totalAmount={data.payables.totalAP}
                overdueAmount={data.payables.overdueAP}
                title="Accounts Payable"
                color="hsl(var(--destructive))"
              />
            </div>
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
              onItemClick={(item) => {
                toast({
                  title: item.itemName,
                  description: `${item.itemNumber} - Stock: ${item.inventoryQty} units`,
                });
              }}
            />
          </SectionShell>

          {/* Financial Summary */}
          <SectionShell
            title="Financial Universe"
            description="Key financial metrics at a glance"
            icon={BarChart3}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Income Statement */}
              <div className="glass-panel p-5 rounded-lg border border-success/30">
                <h3 className="text-lg font-semibold mb-4 text-success">Income Statement</h3>
                <div className="space-y-3">
                  {data.finance.incomeStatementSummary.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={`flex justify-between ${
                        line.lineType === "total" ? "font-bold text-lg border-t border-border pt-2" : ""
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
              <div className="glass-panel p-5 rounded-lg border border-primary/30">
                <h3 className="text-lg font-semibold mb-4 text-primary">Balance Sheet</h3>
                <div className="space-y-3">
                  {data.finance.balanceSheetSummary.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={`flex justify-between ${
                        line.lineType === "total" ? "font-bold text-lg border-t border-border pt-2" : ""
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
              <div className="glass-panel p-5 rounded-lg border border-accent/30">
                <h3 className="text-lg font-semibold mb-4 text-accent">Cash Flow</h3>
                <div className="space-y-3">
                  {data.finance.cashFlowSummary.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={`flex justify-between ${
                        line.lineType === "total" ? "font-bold text-lg border-t border-border pt-2" : ""
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
    </div>
  );
};

export default Index;
