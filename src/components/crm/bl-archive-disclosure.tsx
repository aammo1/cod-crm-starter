"use client";

import * as React from "react";
import { ArchiveIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlArchiveDisclosureProps {
  total: number;
  initiallyOpen?: boolean;
  children: React.ReactNode;
}

export function BlArchiveDisclosure({
  total,
  initiallyOpen = false,
  children,
}: BlArchiveDisclosureProps): React.ReactNode {
  const [isOpen, setIsOpen] = React.useState(initiallyOpen);

  React.useEffect(() => {
    if (initiallyOpen) {
      setIsOpen(true);
    }
  }, [initiallyOpen]);

  return (
    <section aria-labelledby="bl-archive-title" className="space-y-3">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="bl-archive-content"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2.5">
          <ArchiveIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2
            id="bl-archive-title"
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Archives des BL
          </h2>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
              total > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {total}
          </span>
        </div>
        <ChevronDownIcon
          className={cn(
            "size-5 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180 text-foreground",
          )}
          aria-hidden="true"
        />
      </button>

      <div
        id="bl-archive-content"
        role="region"
        aria-labelledby="bl-archive-title"
        hidden={!isOpen}
        className={cn("space-y-3", !isOpen && "hidden")}
      >
        {children}
      </div>
    </section>
  );
}
