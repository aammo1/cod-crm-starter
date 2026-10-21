"use client";

import { PrinterIcon, TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BlPrintActionsProps {
  noteId: string;
  refCode?: string;
  className?: string;
}

export function blPdfLinks(id: string): {
  standard: string;
  a4: string;
  tickets10x10: string;
} {
  return {
    standard: `/api/crm/bl/${id}/pdf?format=standard`,
    a4: `/api/crm/bl/${id}/pdf?format=a4`,
    tickets10x10: `/api/crm/bl/${id}/pdf?format=tickets10x10`,
  };
}

export function BlPrintActions({
  noteId,
  refCode,
  className,
}: BlPrintActionsProps) {
  const links = blPdfLinks(noteId);
  const labelSuffix = refCode ? ` pour le BL ${refCode}` : "";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button asChild size="sm" variant="secondary">
        <a
          href={links.standard}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Imprimer le BL${labelSuffix}`}
        >
          <PrinterIcon className="size-3.5" aria-hidden />
          Imprimer le BL
        </a>
      </Button>

      <div
        role="group"
        aria-label={`Imprimer les étiquettes${labelSuffix}`}
        className="inline-flex flex-wrap items-center rounded-lg border border-border bg-muted/40 p-1 text-xs"
      >
        <span className="flex items-center gap-1.5 px-2 font-medium text-muted-foreground">
          <TagIcon className="size-3 text-primary" aria-hidden />
          Imprimer les étiquettes :
        </span>
        <div className="flex items-center gap-1">
          <a
            href={links.a4}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Imprimer les étiquettes au format A4${labelSuffix}`}
          >
            A4
          </a>
          <a
            href={links.tickets10x10}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Imprimer les étiquettes au format 10 × 10 cm${labelSuffix}`}
          >
            10 × 10 cm
          </a>
        </div>
      </div>
    </div>
  );
}
