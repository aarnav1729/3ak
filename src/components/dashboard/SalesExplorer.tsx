import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/utils/format";
import { useMdSales } from "@/hooks/useMdApi";
import { AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { DataList } from "@/components/dashboard/DataList";

function parseBcDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  return new Date(`${dateStr}T00:00:00Z`);
}

export const SalesExplorer = () => {
  const { data, isLoading, error } = useMdSales();

  const recentInvoices = useMemo(() => {
    if (!data) return [];
    const rows = data.tables.salesInvoices || [];
    return [...rows]
      .filter((inv: any) => inv.postingDate)
      .sort((a: any, b: any) => {
        const da = parseBcDate(a.postingDate)?.getTime() ?? 0;
        const db = parseBcDate(b.postingDate)?.getTime() ?? 0;
        return db - da;
      })
      .slice(0, 15);
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
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
            Unable to load sales details
          </div>
          <div className="text-xs text-muted-foreground">
            Check API connectivity to Business Central.
          </div>
        </div>
      </Card>
    );
  }

  const m = data.metrics;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Metric tiles */}
      <div className="space-y-4">
        <Card className="p-4 border-primary/30">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Today&apos;s Sales
          </div>
          <div className="text-2xl font-bold mt-2">
            {formatCurrency(m.todaySales)}
          </div>
        </Card>
        <Card className="p-4 border-accent/30">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            MTD Sales
          </div>
          <div className="text-2xl font-bold mt-2">
            {formatCurrency(m.mtdSales)}
          </div>
        </Card>
        <Card className="p-4 border-success/30">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            YTD Sales
          </div>
          <div className="text-2xl font-bold mt-2">
            {formatCurrency(m.ytdSales)}
          </div>
        </Card>
        <Card className="p-4 border-info/30">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Last 30 Days
          </div>
          <div className="text-2xl font-bold mt-2">
            {formatCurrency(m.last30DaysSales)}
          </div>
        </Card>
      </div>

      {/* Recent invoices table */}
      <div className="xl:col-span-2">
        <DataList
          data={recentInvoices}
          columns={[
            {
              key: "postingDate",
              label: "Posting Date",
              sortable: true,
              render: (value: string) =>
                parseBcDate(value)?.toLocaleDateString("en-IN") ?? "-",
            },
            {
              key: "number",
              label: "Invoice No.",
              sortable: true,
            },
            { key: "customerName", label: "Customer", sortable: true },
            {
              key: "totalAmountIncludingTax",
              label: "Amount (Incl. Tax)",
              sortable: true,
              align: "right",
              render: (v: number) => formatCurrency(v),
            },
            {
              key: "status",
              label: "Status",
              sortable: true,
            },
          ]}
        />
      </div>
    </div>
  );
};
