import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/utils/format";
import { motion } from "framer-motion";

interface WaterfallData {
  name: string;
  value: number;
  start: number;
  end: number;
  isTotal?: boolean;
  isNegative?: boolean;
}

interface WaterfallChartProps {
  data: {
    label: string;
    amount: number;
    lineType: string;
  }[];
}

export function WaterfallChart({ data }: WaterfallChartProps) {
  // Build waterfall data structure
  const waterfallData: WaterfallData[] = [];
  let runningTotal = 0;

  data.forEach((item) => {
    if (item.lineType === "total" || item.lineType === "header") {
      const start = 0;
      const end = item.amount;
      waterfallData.push({
        name: item.label,
        value: item.amount,
        start,
        end,
        isTotal: true,
        isNegative: item.amount < 0,
      });
      runningTotal = item.amount;
    } else if (item.lineType === "detail") {
      const start = runningTotal;
      const end = runningTotal + item.amount;
      waterfallData.push({
        name: item.label,
        value: Math.abs(item.amount),
        start: Math.min(start, end),
        end: Math.max(start, end),
        isTotal: false,
        isNegative: item.amount < 0,
      });
      runningTotal = end;
    }
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full h-[400px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={waterfallData}
          margin={{ top: 20, right: 30, left: 60, bottom: 80 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={100}
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
            tickFormatter={(value) => formatCurrency(value)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
            formatter={(value: number, name: string, props: any) => {
              const item = props.payload;
              return [
                formatCurrency(item.end - item.start),
                item.isNegative ? "Decrease" : "Increase",
              ];
            }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Bar dataKey="start" stackId="a" fill="transparent" />
          <Bar dataKey="value" stackId="a">
            {waterfallData.map((entry, index) => {
              let color = "hsl(var(--chart-3))"; // Green for positive
              if (entry.isNegative) {
                color = "hsl(var(--destructive))"; // Red for negative
              }
              if (entry.isTotal) {
                color = "hsl(var(--primary))"; // Blue for totals
              }
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={color}
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
