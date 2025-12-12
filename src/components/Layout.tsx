// src/components/Layout.tsx
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type LayoutProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  actions?: React.ReactNode;
};

const NAV = [
  { to: "/", label: "FY Table" },
  { to: "/fy", label: "Dashboard" },
];

export default function Layout({
  title,
  children,
  className,
  containerClassName,
  actions,
}: LayoutProps) {
  const location = useLocation();

  return (
    <div className={cn("min-h-screen bg-background text-foreground", className)}>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-none">
                3AK Dashboard
              </span>
              <span className="text-xs text-muted-foreground leading-none">
                Business Central Analytics
              </span>
            </div>

            <nav className="ml-4 hidden items-center gap-2 md:flex">
              {NAV.map((item) => {
                const active =
                  location.pathname === item.to ||
                  (item.to !== "/" && location.pathname.startsWith(item.to));
                return (
                  <Button
                    key={item.to}
                    asChild
                    variant={active ? "default" : "ghost"}
                    size="sm"
                  >
                    <Link to={item.to}>{item.label}</Link>
                  </Button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">{actions}</div>
        </div>

        {title ? (
          <div className="mx-auto max-w-7xl px-4 pb-3">
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
        ) : null}
      </header>

      <main className={cn("mx-auto max-w-7xl px-4 py-6", containerClassName)}>
        {children}
      </main>

      <footer className="border-t py-6">
        <div className="mx-auto max-w-7xl px-4 text-xs text-muted-foreground">
          © {new Date().getFullYear()} 3AK Chemie Pvt Ltd. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
