import { Card } from "@/components/ui/card";
import { useMdPayablesAging } from "@/hooks/useMdApi";
import { formatCurrency, formatPercent } from "@/utils/format";
import { AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { DataList } from "@/components/dashboard/DataList";

export const PayablesAgingPanel = () => {
  const { data, isLoading, error } = useMdPayablesAging();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-4 border-destructive border-t-transparent rounded-full"
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
            Unable to load AP ageing
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
        <Card className="p-4 border-destructive/30 bg-destructive/5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Total AP
          </div>
          <div className="text-2xl font-bold mt-2">
            {formatCurrency(m.totalAP)}
          </div>
        </Card>
        <Card className="p-4 border-destructive/30">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Overdue AP
          </div>
          <div className="text-2xl font-bold mt-2 text-destructive">
            {formatCurrency(m.overdueAP)}
          </div>
        </Card>
        <Card className="p-4 border-destructive/30">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Overdue %
          </div>
          <div className="text-2xl font-bold mt-2 text-destructive">
            {formatPercent(m.overdueAPRatioPercent)}
          </div>
        </Card>
      </div>

      <div className="xl:col-span-2">
        <DataList
          data={data.rows.filter(
            (r: any) =>
              r.vendorNumber &&
              String(r.name || "")
                .trim()
                .toLowerCase() !== "total"
          )}
          columns={[
            {
              key: "name",
              label: "Vendor",
              sortable: true,
            },
            {
              key: "vendorNumber",
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
