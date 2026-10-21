"use client";

import { BoxesIcon, HistoryIcon, SlidersHorizontalIcon } from "lucide-react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "cn";

import {
  BalancesTable,
  MovementsAudit,
  type StockMovementRow,
  type StockVariantRow,
} from "@/components/crm/stock-tables";
import { StockProductPanel } from "@/components/crm/stock-product-panel";

export interface StockWorkspaceProps {
  variantRows: StockVariantRow[];
  movementRows: StockMovementRow[];
  isAdmin: boolean;
}

export function StockWorkspace({
  variantRows,
  movementRows,
  isAdmin,
}: StockWorkspaceProps) {
  return (
    <TabsPrimitive.Root defaultValue="balances" className="space-y-6">
      <div className="overflow-x-auto pb-1">
        <TabsPrimitive.List
          aria-label="Espaces de gestion de stock"
          className="inline-flex min-w-full sm:min-w-0 items-center gap-1.5 rounded-xl border border-border bg-card p-1.5 text-sm text-muted-foreground"
        >
          <TabsPrimitive.Trigger
            value="balances"
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all outline-none cursor-pointer",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-xs",
              "focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <BoxesIcon className="size-4 shrink-0" aria-hidden />
            <span>Stock disponible</span>
            <span className="rounded-full bg-muted/80 px-1.5 py-0.5 text-xs text-muted-foreground">
              {variantRows.length}
            </span>
          </TabsPrimitive.Trigger>

          <TabsPrimitive.Trigger
            value="movements"
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all outline-none cursor-pointer",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-xs",
              "focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <HistoryIcon className="size-4 shrink-0" aria-hidden />
            <span>Mouvements</span>
            <span className="rounded-full bg-muted/80 px-1.5 py-0.5 text-xs text-muted-foreground">
              {movementRows.length}
            </span>
          </TabsPrimitive.Trigger>

            <TabsPrimitive.Trigger
              value="details"
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all outline-none cursor-pointer",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
                "data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-xs",
                "focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <SlidersHorizontalIcon className="size-4 shrink-0" aria-hidden />
              <span>Détail / quarantaine</span>
            </TabsPrimitive.Trigger>
        </TabsPrimitive.List>
      </div>

      <TabsPrimitive.Content
        value="balances"
        forceMount
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl data-[state=inactive]:hidden"
      >
        <StockProductPanel rows={variantRows} isAdmin={isAdmin} />
      </TabsPrimitive.Content>

      <TabsPrimitive.Content
        value="movements"
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      >
        <MovementsAudit movements={movementRows} />
      </TabsPrimitive.Content>

        <TabsPrimitive.Content
          value="details"
          forceMount
          className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl data-[state=inactive]:hidden"
        >
          <BalancesTable rows={variantRows} isAdmin={isAdmin} />
        </TabsPrimitive.Content>
    </TabsPrimitive.Root>
  );
}
