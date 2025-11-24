import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface SectionShellProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
  headerAction?: ReactNode;
}

export function SectionShell({
  title,
  description,
  icon: Icon,
  children,
  headerAction,
}: SectionShellProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6 }}
      className="bg-white rounded-xl p-6 border border-border shadow-sm hover:shadow-md transition-all duration-300"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
              <Icon className="w-6 h-6 text-primary" />
            </div>
          )}
          <div>
            <motion.h2
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold text-foreground relative"
            >
              {title}
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="absolute -bottom-1 left-0 w-16 h-0.5 bg-primary origin-left"
              />
            </motion.h2>
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
        </div>
        {headerAction && <div>{headerAction}</div>}
      </div>
      <div>{children}</div>
    </motion.section>
  );
}
