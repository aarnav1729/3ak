import { useEffect, useState } from "react";
import { LucideIcon } from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

interface KpiCardProps {
  title: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "primary" | "secondary" | "accent" | "success" | "warning";
  animateValue?: boolean;
}

export function KpiCard({
  title,
  value,
  prefix = "",
  suffix = "",
  icon: Icon,
  trend,
  variant = "primary",
  animateValue = true,
}: KpiCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const numericValue = typeof value === "number" ? value : 0;
  const displayValue = typeof value === "string" ? value : "";
  
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => {
    if (typeof value === "string") return value;
    return Math.round(latest).toLocaleString();
  });

  useEffect(() => {
    if (animateValue && typeof value === "number") {
      const controls = animate(count, numericValue, {
        duration: 1.5,
        ease: "easeOut",
      });
      return controls.stop;
    }
  }, [numericValue, animateValue]);

  const variantStyles = {
    primary: "border-primary/20 hover:border-primary/40 bg-white",
    secondary: "border-border hover:border-border/60 bg-white",
    accent: "border-accent/20 hover:border-accent/40 bg-white",
    success: "border-success/20 hover:border-success/40 bg-white",
    warning: "border-warning/20 hover:border-warning/40 bg-white",
  };

  const iconColorStyles = {
    primary: "text-primary",
    secondary: "text-muted-foreground",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={`rounded-lg p-6 border-2 transition-all duration-300 hover:shadow-lg ${variantStyles[variant]}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
            {title}
          </p>
        </div>
        <motion.div
          animate={{ 
            scale: isHovered ? 1.1 : 1,
            rotate: isHovered ? 5 : 0 
          }}
          transition={{ duration: 0.2 }}
        >
          <Icon className={`w-8 h-8 ${iconColorStyles[variant]}`} />
        </motion.div>
      </div>

      <div className="flex items-baseline gap-1 mb-2">
        {prefix && <span className="text-2xl font-semibold text-muted-foreground">{prefix}</span>}
        <motion.span className="text-4xl font-bold text-foreground">
          {animateValue && typeof value === "number" ? rounded : displayValue}
        </motion.span>
        {suffix && <span className="text-2xl font-semibold text-muted-foreground">{suffix}</span>}
      </div>

      {trend && (
        <div className="flex items-center gap-2">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className={`text-sm font-medium ${
              trend.isPositive ? "text-success" : "text-destructive"
            }`}
          >
            {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
          </motion.div>
          <span className="text-xs text-muted-foreground">vs last period</span>
        </div>
      )}

    </motion.div>
  );
}
