import { TrendingUp, DollarSign, Users, Package, PieChart, Activity, Wallet } from "lucide-react";
import { KpiCard } from "./KpiCard";
import { formatCurrency, formatNumber } from "@/utils/format";
import { MdSnapshot } from "@/types/dashboard";
import { motion } from "framer-motion";

interface HeroHudProps {
  data: MdSnapshot;
}

export function HeroHud({ data }: HeroHudProps) {
  // Calculate net income from finance data
  const netIncome = data.finance.incomeStatementSummary.find(
    (line) => line.label.toLowerCase().includes("net income")
  )?.amount || 0;

  // Calculate cash at end from cash flow
  const cashAtEnd = data.finance.cashFlowSummary.find(
    (line) => line.label.toLowerCase().includes("cash at end")
  )?.amount || 0;

  return (
    <div className="relative mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Today Sales"
          value={data.sales.todaySales}
          prefix={formatCurrency(data.sales.todaySales)}
          icon={TrendingUp}
          variant="primary"
        />

        <KpiCard
          title="YTD Sales"
          value={data.sales.ytdSales}
          prefix={formatCurrency(data.sales.ytdSales)}
          icon={DollarSign}
          variant="success"
        />

        <KpiCard
          title="Total AR"
          value={data.receivables.totalAR}
          prefix={formatCurrency(data.receivables.totalAR)}
          icon={Users}
          variant="accent"
          trend={{
            value: data.receivables.overdueRatioPercent,
            isPositive: data.receivables.overdueRatioPercent < 20,
          }}
        />

        <KpiCard
          title="Total AP"
          value={data.payables.totalAP}
          prefix={formatCurrency(data.payables.totalAP)}
          icon={Wallet}
          variant="warning"
        />

        <KpiCard
          title="Inventory Value"
          value={data.inventory.estInventoryValue}
          prefix={formatCurrency(data.inventory.estInventoryValue)}
          icon={Package}
          variant="secondary"
        />

        <KpiCard
          title="Total SKUs"
          value={formatNumber(data.inventory.totalSkus)}
          icon={PieChart}
          variant="primary"
          animateValue={false}
        />

        <KpiCard
          title="Net Income"
          value={netIncome}
          prefix={formatCurrency(netIncome)}
          icon={Activity}
          variant={netIncome >= 0 ? "success" : "warning"}
        />

        <KpiCard
          title="Cash at End"
          value={cashAtEnd}
          prefix={formatCurrency(cashAtEnd)}
          icon={DollarSign}
          variant="accent"
        />
      </div>
    </div>
  );
}
