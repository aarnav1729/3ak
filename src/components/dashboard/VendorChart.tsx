// src/components/dashboard/VendorChart.tsx
import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { TopVendor } from "@/types/dashboard";
import { formatCurrency } from "@/utils/format";

interface VendorChartProps {
  vendors: TopVendor[];
  onVendorClick?: (vendor: TopVendor) => void;
}

const MAX_VENDORS = 10;

const BAR_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--accent))",
  "hsl(var(--info))",
  "hsl(var(--warning))",
];

export const VendorChart: React.FC<VendorChartProps> = ({
  vendors,
  onVendorClick,
}) => {
  const data = useMemo(() => {
    const sorted = [...vendors]
      .sort((a, b) => b.totalPurchases - a.totalPurchases)
      .slice(0, MAX_VENDORS);

    return sorted.map((v) => ({
      ...v,
      purchasesCr: v.totalPurchases / 10_000_000, // ₹ Cr
    }));
  }, [vendors]);

  const totalOfShown = useMemo(
    () => data.reduce((sum, d) => sum + d.totalPurchases, 0),
    [data]
  );

  const maxCr = data.length ? Math.max(...data.map((d) => d.purchasesCr)) : 0;

  const domainMax = maxCr === 0 ? 1 : Math.ceil(maxCr * 1.1 * 10) / 10;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-border shadow-sm p-4 h-[360px] flex flex-col">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Top Vendors (YTD)
          </p>
          <p className="text-[11px] text-muted-foreground">Values in ₹ Cr</p>
        </div>
        {data.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Shown total:&nbsp;
            <span className="font-medium">{formatCurrency(totalOfShown)}</span>
          </p>
        )}
      </div>

      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="hsl(var(--border))"
            />
            <XAxis
              type="number"
              domain={[0, domainMax]}
              tickFormatter={(v) => `${v.toFixed(1)} Cr`}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
            />
            <YAxis
              dataKey="vendorName"
              type="category"
              width={250}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.25)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload as any;

                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md space-y-1">
                    <div className="font-medium text-foreground">
                      {item.vendorName}
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-muted-foreground">
                        Purchases (YTD)
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(item.totalPurchases)}
                      </span>
                    </div>
                    {totalOfShown > 0 && (
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Share of top list
                        </span>
                        <span>
                          {((item.totalPurchases / totalOfShown) * 100).toFixed(
                            1
                          )}
                          %
                        </span>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="purchasesCr"
              radius={[4, 4, 4, 4]}
              onClick={
                onVendorClick
                  ? (entry) =>
                      onVendorClick({
                        vendorNumber: (entry as any).vendorNumber,
                        vendorName: (entry as any).vendorName,
                        totalPurchases: (entry as any).totalPurchases,
                      })
                  : undefined
              }
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.vendorNumber}
                  fill={BAR_COLORS[index] ?? "hsl(var(--primary))"}
                  className={onVendorClick ? "cursor-pointer" : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
