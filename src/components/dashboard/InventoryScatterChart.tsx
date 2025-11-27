// src/components/dashboard/InventoryScatterChart.tsx
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { InventoryItem } from "@/types/dashboard";
import { formatCurrency, formatNumber } from "@/utils/format";

interface InventoryScatterChartProps {
  items: InventoryItem[];
  slowMovers: InventoryItem[];
  onItemClick?: (item: InventoryItem) => void;
}

export const InventoryScatterChart: React.FC<InventoryScatterChartProps> = ({
  items,
  slowMovers,
  onItemClick,
}) => {
  // mark slow movers
  const slowSet = new Set(slowMovers.map((i) => i.itemNumber));

  // focus on highest value SKUs
  const sortedByValue = [...items].sort(
    (a, b) => b.inventoryValue - a.inventoryValue
  );
  const limited = sortedByValue.slice(0, 80); // avoid clutter

  const data = limited.map((i) => ({
    ...i,
    valueCr: i.inventoryValue / 10_000_000,
    sold: i.soldQtyLast90,
    isSlow: slowSet.has(i.itemNumber),
  }));

  const maxValueCr = data.length ? Math.max(...data.map((d) => d.valueCr)) : 0;
  const maxSold = data.length ? Math.max(...data.map((d) => d.sold)) : 0;

  const domainValue: [number, number] = [0, Math.ceil(maxValueCr * 1.1)];
  const domainSold: [number, number] = [0, Math.ceil(maxSold * 1.1)];

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-border shadow-sm p-4 h-[380px] flex flex-col">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Inventory Value vs Movement
          </p>
          <p className="text-[11px] text-muted-foreground">
            Bubble size = stock qty, color = slow vs normal
          </p>
        </div>
      </div>

      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 24, bottom: 32, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              dataKey="valueCr"
              name="Inventory Value"
              domain={domainValue}
              tickFormatter={(v) => `${v.toFixed(1)} Cr`}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
              label={{
                value: "Inventory Value (₹ Cr)",
                position: "insideBottom",
                offset: -18,
                fill: "hsl(var(--muted-foreground))",
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="sold"
              name="Sold (90 days)"
              domain={domainSold}
              tickFormatter={(v) => formatNumber(v)}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
              label={{
                value: "Sold Qty (last 90 days)",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                fill: "hsl(var(--muted-foreground))",
                fontSize: 11,
              }}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--muted))", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload as any;

                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md space-y-1 max-w-xs">
                    <div className="font-medium text-foreground">
                      {item.itemName}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Item #{item.itemNumber}
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-muted-foreground">
                        Inventory value
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(item.inventoryValue)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-muted-foreground">Stock qty</span>
                      <span>{formatNumber(item.inventoryQty)}</span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-muted-foreground">
                        Sold (90 days)
                      </span>
                      <span>{formatNumber(item.soldQtyLast90)}</span>
                    </div>
                    {item.isSlow && (
                      <div className="text-warning text-[11px]">
                        🐌 Marked as slow mover
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconSize={10}
              wrapperStyle={{ fontSize: 11 }}
            />
            <Scatter
              name="Normal"
              data={data.filter((d) => !d.isSlow)}
              onClick={
                onItemClick
                  ? (entry) =>
                      onItemClick({
                        itemNumber: (entry as any).itemNumber,
                        itemName: (entry as any).itemName,
                        inventoryQty: (entry as any).inventoryQty,
                        unitCost: (entry as any).unitCost,
                        inventoryValue: (entry as any).inventoryValue,
                        soldQtyLast90: (entry as any).soldQtyLast90,
                      })
                  : undefined
              }
            >
              {data
                .filter((d) => !d.isSlow)
                .map((d) => (
                  <Cell
                    key={`normal-${d.itemNumber}`}
                    fill="hsl(var(--success))"
                    r={6}
                    className={onItemClick ? "cursor-pointer" : undefined}
                  />
                ))}
            </Scatter>
            <Scatter
              name="Slow mover"
              data={data.filter((d) => d.isSlow)}
              onClick={
                onItemClick
                  ? (entry) =>
                      onItemClick({
                        itemNumber: (entry as any).itemNumber,
                        itemName: (entry as any).itemName,
                        inventoryQty: (entry as any).inventoryQty,
                        unitCost: (entry as any).unitCost,
                        inventoryValue: (entry as any).inventoryValue,
                        soldQtyLast90: (entry as any).soldQtyLast90,
                      })
                  : undefined
              }
            >
              {data
                .filter((d) => d.isSlow)
                .map((d) => (
                  <Cell
                    key={`slow-${d.itemNumber}`}
                    fill="hsl(var(--warning))"
                    r={7}
                    className={onItemClick ? "cursor-pointer" : undefined}
                  />
                ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
