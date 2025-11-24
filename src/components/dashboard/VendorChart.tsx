import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TopVendor } from "@/types/dashboard";
import { formatCurrency } from "@/utils/format";
import { motion } from "framer-motion";

interface VendorChartProps {
  vendors: TopVendor[];
  onVendorClick?: (vendor: TopVendor) => void;
}

export function VendorChart({ vendors, onVendorClick }: VendorChartProps) {
  const chartData = vendors.slice(0, 8).map((vendor) => ({
    name: vendor.vendorName.length > 25 
      ? vendor.vendorName.substring(0, 25) + "..." 
      : vendor.vendorName,
    value: vendor.totalPurchases,
    vendor,
  }));

  const colors = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
    "hsl(var(--primary))",
    "hsl(var(--accent))",
    "hsl(var(--info))",
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full h-[400px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="horizontal"
          margin={{ top: 20, right: 30, left: 120, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
            tickFormatter={(value) => formatCurrency(value)}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
            width={110}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
            formatter={(value: number) => [formatCurrency(value), "Total Purchases"]}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            onClick={(data) => onVendorClick?.(data.vendor)}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={colors[index % colors.length]}
                className="hover:opacity-80 transition-opacity"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
