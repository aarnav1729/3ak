import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatCurrency } from "@/utils/format";
import { motion } from "framer-motion";

interface OverdueDonutChartProps {
  totalAmount: number;
  overdueAmount: number;
  title: string;
  color: string;
}

export function OverdueDonutChart({
  totalAmount,
  overdueAmount,
  title,
  color,
}: OverdueDonutChartProps) {
  const currentAmount = totalAmount - overdueAmount;

  const data = [
    { name: "Current", value: currentAmount, color: "hsl(var(--success))" },
    { name: "Overdue", value: overdueAmount, color: color },
  ];

  const overdueRatio = totalAmount > 0 ? (overdueAmount / totalAmount) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center"
    >
      <h3 className="text-lg font-semibold mb-4 text-center">{title}</h3>
      <div className="relative w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  className="hover:opacity-80 transition-opacity cursor-pointer"
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-3xl font-bold text-glow">{overdueRatio.toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground uppercase">Overdue</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 w-full">
        <div className="glass-panel p-3 rounded-lg text-center">
          <div className="text-xs text-muted-foreground uppercase mb-1">Total</div>
          <div className="text-lg font-semibold">{formatCurrency(totalAmount)}</div>
        </div>
        <div className="glass-panel p-3 rounded-lg text-center">
          <div className="text-xs text-muted-foreground uppercase mb-1">Overdue</div>
          <div className="text-lg font-semibold text-warning">{formatCurrency(overdueAmount)}</div>
        </div>
      </div>
    </motion.div>
  );
}
