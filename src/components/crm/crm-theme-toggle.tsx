"use client";

import * as React from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useCrmTheme } from "./crm-theme-provider";
import { cn } from "@/lib/utils";

export function CrmThemeToggle({
  className,
}: {
  className?: string;
}): React.ReactNode {
  const { theme, toggleTheme } = useCrmTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Activer le thème clair" : "Activer le thème sombre";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {isDark ? (
        <SunIcon className="size-5 shrink-0" aria-hidden="true" />
      ) : (
        <MoonIcon className="size-5 shrink-0" aria-hidden="true" />
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
}
