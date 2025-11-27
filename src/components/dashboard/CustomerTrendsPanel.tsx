import { useMdCustomerTrends } from "@/hooks/useMdApi";
import { Card } from "@/components/ui/card";
import { DataList } from "@/components/dashboard/DataList";
import { formatCurrency } from "@/utils/format";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export const CustomerTrendsPanel = () => {
  const { data, isLoading, error } = useMdCustomerTrends();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-4 flex items-center gap-3 bg-destructive/5 border-destructive/30">
        <AlertCircle className="w-5 h-5 text-destructive" />
        <div>
          <div className="font-semibold text-destructive">
            Unable to load customer trends
          </div>
          <div className="text-xs text-muted-foreground">
            Check API connectivity to Business Central.
          </div>
        </div>
      </Card>
    );
  }

  const topRows = data.rows.slice(0, 15);
  const chartData = topRows.map((r: any) => ({
    name: r.name ?? r.customerName ?? r.customerNumber,
    total: Number(r.totalSalesAmount ?? 0),
  }));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card className="p-4 xl:col-span-1">
        <div className="text-sm font-semibold mb-3">Top Customers by Sales</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" hide tick={{ fontSize: 10 }} interval={0} />
              <YAxis hide />
              <Tooltip
                formatter={(v: number) => formatCurrency(v)}
                labelClassName="text-xs"
              />
              <Bar dataKey="total" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="xl:col-span-2">
        <DataList
          data={topRows}
          columns={[
            {
              key: "name",
              label: "Customer",
              sortable: true,
              render: (v: string, row: any) =>
                v || row.customerName || row.customerNumber,
            },
            {
              key: "customerNumber",
              label: "Number",
              sortable: true,
            },
            {
              key: "totalSalesAmount",
              label: "Total Sales",
              sortable: true,
              align: "right",
              render: (v: number) => formatCurrency(v),
            },
            {
              key: "totalQuantity",
              label: "Quantity",
              sortable: true,
              align: "right",
            },
          ]}
        />
      </div>
    </div>
  );
};
