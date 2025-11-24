import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TopCustomer } from "@/types/dashboard";
import { formatCurrency } from "@/utils/format";
import { motion } from "framer-motion";

interface TopCustomersChartProps {
  customers: TopCustomer[];
  onCustomerClick?: (customer: TopCustomer) => void;
}

export function TopCustomersChart({ customers, onCustomerClick }: TopCustomersChartProps) {
  const chartData = customers.slice(0, 10).map((customer) => ({
    name: customer.customerName.length > 20 
      ? customer.customerName.substring(0, 20) + "..." 
      : customer.customerName,
    value: customer.totalSales,
    customer,
  }));

  const maxValue = Math.max(...chartData.map((d) => d.value));

  const colors = [
    "hsl(180, 100%, 50%)",
    "hsl(180, 100%, 60%)",
    "hsl(200, 100%, 55%)",
    "hsl(210, 100%, 60%)",
    "hsl(220, 100%, 65%)",
    "hsl(240, 100%, 65%)",
    "hsl(260, 100%, 65%)",
    "hsl(280, 100%, 60%)",
    "hsl(300, 100%, 60%)",
    "hsl(320, 100%, 60%)",
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
          margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            type="number"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            tickFormatter={(value) => formatCurrency(value)}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
            width={90}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold" }}
            formatter={(value: number, name: string, props: any) => [
              formatCurrency(value),
              `Sales: ${((value / maxValue) * 100).toFixed(1)}% of top`
            ]}
          />
          <Bar
            dataKey="value"
            radius={[0, 8, 8, 0]}
            cursor="pointer"
            onClick={(data) => onCustomerClick?.(data.customer)}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={colors[index % colors.length]}
                opacity={0.9}
                className="hover:opacity-100 transition-opacity"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
