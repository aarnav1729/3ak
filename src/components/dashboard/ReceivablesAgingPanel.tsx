import { Card } from "@/components/ui/card";
import { useMdReceivablesAging } from "@/hooks/useMdApi";
import { formatCurrency, formatPercent } from "@/utils/format";
import { AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { DataList } from "@/components/dashboard/DataList";

export const ReceivablesAgingPanel = () => {
  const { data, isLoading, error } = useMdReceivablesAging();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-4 border-warning border-t-transparent rounded-full"
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
            Unable to load AR ageing
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
      <div className="space-y-4">
        <Card className="p-4 border-warning/30 bg-warning/5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Total AR
          </div>
          <div className="text-2xl font-bold mt-2">
            {formatCurrency(m.totalAR)}
          </div>
        </Card>
        <Card className="p-4 border-warning/30">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Overdue AR
          </div>
          <div className="text-2xl font-bold mt-2 text-warning">
            {formatCurrency(m.overdueAR)}
          </div>
        </Card>
        <Card className="p-4 border-warning/30">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Overdue %
          </div>
          <div className="text-2xl font-bold mt-2 text-warning">
            {formatPercent(m.overdueRatioPercent)}
          </div>
        </Card>
      </div>

      <div className="xl:col-span-2">
        <DataList
          data={data.rows.filter(
            (r: any) =>
              r.customerNumber &&
              String(r.name || "")
                .trim()
                .toLowerCase() !== "total"
          )}
          columns={[
            {
              key: "name",
              label: "Customer",
              sortable: true,
            },
            {
              key: "customerNumber",
              label: "Number",
              sortable: true,
            },
            {
              key: "balanceDue",
              label: "Balance Due",
              sortable: true,
              align: "right",
              render: (v: number) => formatCurrency(v),
            },
            {
              key: "period1Amount",
              label: "1–30 days",
              sortable: true,
              align: "right",
              render: (v: number) => formatCurrency(v),
            },
            {
              key: "period2Amount",
              label: "31–60 days",
              sortable: true,
              align: "right",
              render: (v: number) => formatCurrency(v),
            },
            {
              key: "period3Amount",
              label: "60+ days",
              sortable: true,
              align: "right",
              render: (v: number) => formatCurrency(v),
            },
          ]}
        />
      </div>
    </div>
  );
};
