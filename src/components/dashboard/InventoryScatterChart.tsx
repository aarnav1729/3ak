import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ZAxis,
  ReferenceLine,
} from "recharts";
import { InventoryItem } from "@/types/dashboard";
import { formatCurrency, formatNumber } from "@/utils/format";
import { motion } from "framer-motion";

interface InventoryScatterChartProps {
  items: InventoryItem[];
  slowMovers: InventoryItem[];
  onItemClick?: (item: InventoryItem) => void;
}

export function InventoryScatterChart({
  items,
  slowMovers,
  onItemClick,
}: InventoryScatterChartProps) {
  const slowMoverIds = new Set(slowMovers.map((item) => item.itemNumber));

  const chartData = items.map((item) => ({
    x: item.inventoryValue,
    y: item.soldQtyLast90,
    z: item.inventoryQty,
    name: item.itemName,
    item,
    isSlow: slowMoverIds.has(item.itemNumber),
  }));

  // Calculate median values for quadrant lines
  const sortedByValue = [...items].sort((a, b) => a.inventoryValue - b.inventoryValue);
  const sortedBySales = [...items].sort((a, b) => a.soldQtyLast90 - b.soldQtyLast90);
  const medianValue = sortedByValue[Math.floor(sortedByValue.length / 2)]?.inventoryValue || 0;
  const medianSales = sortedBySales[Math.floor(sortedBySales.length / 2)]?.soldQtyLast90 || 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full h-[500px]"
    >
      <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
        <div className="glass-panel p-2 rounded">
          <span className="inline-block w-3 h-3 rounded-full bg-success mr-2"></span>
          <span className="text-muted-foreground">Stars (High Value, High Sales)</span>
        </div>
        <div className="glass-panel p-2 rounded">
          <span className="inline-block w-3 h-3 rounded-full bg-warning mr-2"></span>
          <span className="text-muted-foreground">Slow Movers (High Value, Low Sales)</span>
        </div>
        <div className="glass-panel p-2 rounded">
          <span className="inline-block w-3 h-3 rounded-full bg-primary mr-2"></span>
          <span className="text-muted-foreground">Fast Movers (Low Value, High Sales)</span>
        </div>
        <div className="glass-panel p-2 rounded">
          <span className="inline-block w-3 h-3 rounded-full bg-muted mr-2"></span>
          <span className="text-muted-foreground">Low Priority (Low Value, Low Sales)</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            type="number"
            dataKey="x"
            name="Inventory Value"
            stroke="hsl(var(--muted-foreground))"
            label={{
              value: "Inventory Value",
              position: "bottom",
              offset: 40,
              style: { fill: "hsl(var(--muted-foreground))", fontSize: 12 },
            }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(value) => formatCurrency(value)}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Sold Qty (90d)"
            stroke="hsl(var(--muted-foreground))"
            label={{
              value: "Sold Qty (Last 90 Days)",
              angle: -90,
              position: "left",
              offset: 40,
              style: { fill: "hsl(var(--muted-foreground))", fontSize: 12 },
            }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(value) => formatNumber(value)}
          />
          <ZAxis type="number" dataKey="z" range={[50, 400]} />
          
          {/* Quadrant dividers */}
          <ReferenceLine
            x={medianValue}
            stroke="hsl(var(--primary))"
            strokeDasharray="3 3"
            opacity={0.4}
          />
          <ReferenceLine
            y={medianSales}
            stroke="hsl(var(--primary))"
            strokeDasharray="3 3"
            opacity={0.4}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
            content={({ active, payload }) => {
              if (active && payload && payload[0]) {
                const data = payload[0].payload;
                return (
                  <div className="glass-panel p-3 rounded-lg">
                    <p className="font-semibold text-foreground mb-2">{data.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Value: {formatCurrency(data.x)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Sold (90d): {formatNumber(data.y)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Stock Qty: {formatNumber(data.z)}
                    </p>
                    {data.isSlow && (
                      <div className="mt-2 text-xs text-warning font-medium">⚠️ Slow Mover</div>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />

          <Scatter
            data={chartData}
            cursor="pointer"
            onClick={(data) => onItemClick?.(data.item)}
          >
            {chartData.map((entry, index) => {
              let color = "hsl(var(--muted))";
              
              // Determine color based on quadrant
              if (entry.x > medianValue && entry.y > medianSales) {
                color = "hsl(var(--success))"; // Stars
              } else if (entry.x > medianValue && entry.y <= medianSales) {
                color = "hsl(var(--warning))"; // Slow movers
              } else if (entry.x <= medianValue && entry.y > medianSales) {
                color = "hsl(var(--primary))"; // Fast movers
              }

              return (
                <Cell
                  key={`cell-${index}`}
                  fill={color}
                  opacity={0.8}
                  className="hover:opacity-100 transition-opacity"
                />
              );
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
