// src/components/dashboard/WaterfallChart.tsx
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import { FinanceLine } from "@/types/dashboard";
import { formatCurrency } from "@/utils/format";

interface WaterfallChartProps {
  data: FinanceLine[];
}

interface WaterfallPoint {
  name: string;
  type: FinanceLine["lineType"];
  base: number;
  value: number;
  bar: number;
}

export const WaterfallChart: React.FC<WaterfallChartProps> = ({ data }) => {
  // Keep only meaningful lines
  const lines = data.filter((l) => l.label && l.lineType !== "spacer");

  const wfData: WaterfallPoint[] = [];
  let running = 0;

  for (const line of lines) {
    if (line.amount === 0 && line.lineType !== "total") continue;

    if (line.lineType === "total") {
      // treat totals as absolute anchors
      wfData.push({
        name: line.label,
        type: line.lineType,
        base: 0,
        value: line.amount,
        bar: line.amount,
      });
      running = line.amount;
    } else {
      const start = running;
      const end = running + line.amount;
      const barValue = end - start;

      wfData.push({
        name: line.label,
        type: line.lineType,
        base: Math.min(start, end),
        value: barValue,
        bar: Math.abs(barValue),
      });

      running = end;
    }
  }

  const allValues = wfData.flatMap((p) => [p.base, p.base + p.value]);
  const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxVal = allValues.length > 0 ? Math.max(...allValues) : 0;

  const padding = (maxVal - minVal || 1) * 0.15;
  const domain: [number, number] = [minVal - padding, maxVal + padding];

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-border shadow-sm p-4 h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={wfData}
          margin={{ top: 12, right: 16, left: 0, bottom: 32 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval={0}
            angle={-25}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tickFormatter={(v) => `${(v / 10_000_000).toFixed(1)} Cr`}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
            domain={domain}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0].payload as WaterfallPoint;

              return (
                <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md space-y-1">
                  <div className="font-medium text-foreground">{item.name}</div>
                  <div className="flex justify-between gap-6">
                    <span className="text-muted-foreground">Delta</span>
                    <span
                      className={
                        item.value < 0
                          ? "text-destructive font-semibold"
                          : "text-success font-semibold"
                      }
                    >
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-muted-foreground">Level after</span>
                    <span className="font-semibold">
                      {formatCurrency(item.base + item.value)}
                    </span>
                  </div>
                </div>
              );
            }}
          />
          <ReferenceLine
            y={0}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
          />
          <Bar
            dataKey="bar"
            stackId="wf"
            radius={[4, 4, 0, 0]}
            isAnimationActive={true}
          >
            {wfData.map((p, index) => {
              let fill = "hsl(var(--primary))";

              if (p.type === "total") {
                fill = "hsl(var(--primary))";
              } else if (p.value > 0) {
                fill = "hsl(var(--success))";
              } else if (p.value < 0) {
                fill = "hsl(var(--destructive))";
              }

              return <Cell key={`${p.name}-${index}`} fill={fill} />;
            })}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
