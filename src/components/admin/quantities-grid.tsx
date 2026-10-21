"use client";

import type { CSSProperties, ReactNode } from "react";
import { Input } from "@/components/ui/input";

export interface QuantityCell {
  id: string;
  colorId: string;
  colorName: string;
  size: string;
  disabled?: boolean;
  detail?: ReactNode;
}

/** One set of inputs: a size-column matrix on desktop, labelled color blocks on phones. */
export function QuantitiesGrid({ cells, values, onChange, disabled, min = 0 }: {
  cells: QuantityCell[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  disabled?: boolean;
  min?: number;
}) {
  const sizes = [...new Set(cells.map((cell) => cell.size))].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  const colors = [...new Map(cells.map((cell) => [cell.colorId, cell.colorName])).entries()];
  return (
    <div className="overflow-x-auto">
      <div className="min-w-0 space-y-4 md:space-y-0" role="group" aria-label="Quantités par couleur et pointure">
        <div className="hidden gap-3 border-b border-border pb-3 text-center text-xs font-medium text-muted-foreground md:grid" style={{ gridTemplateColumns: `minmax(120px, 1fr) repeat(${sizes.length}, minmax(100px, 1fr))` }}>
          <span className="text-left">Couleur / pointure</span>
          {sizes.map((size) => <span key={size}>{size}</span>)}
        </div>
        {colors.map(([colorId, name]) => (
          <div key={colorId} className="rounded-lg border border-border p-3 md:rounded-none md:border-0 md:border-b md:py-4 md:px-0">
              <div className="grid gap-3 md:items-start md:[grid-template-columns:var(--quantity-columns)]" style={{ "--quantity-columns": `minmax(120px, 1fr) repeat(${sizes.length}, minmax(100px, 1fr))` } as CSSProperties}>
                <p className="text-sm font-medium md:pt-2">{name}</p>
                {sizes.map((size) => {
                  const cell = cells.find((item) => item.colorId === colorId && item.size === size);
                  return (
                    <div key={size} className="min-w-0">
                      {cell ? (
                        <label className="flex items-start gap-3 md:block">
                          <span className="w-20 shrink-0 pt-2 text-xs text-muted-foreground md:sr-only">Pointure {size}</span>
                          <span className="block min-w-0 flex-1 space-y-1.5">
                            <Input type="number" inputMode="numeric" min={min} step={1}
                              value={values[cell.id] ?? ""} disabled={disabled || cell.disabled}
                              onChange={(event) => onChange(cell.id, event.target.value)}
                              aria-label={`${name}, pointure ${size} — quantité`}
                              placeholder={cell.disabled ? "—" : "Vide"}
                              className="w-full min-w-20 bg-background text-foreground tabular-nums md:text-center" />
                            {cell.detail && <span className="block text-xs leading-relaxed text-muted-foreground">{cell.detail}</span>}
                          </span>
                        </label>
                      ) : <span className="hidden text-center text-muted-foreground md:block">—</span>}
                    </div>
                  );
                })}
              </div>
          </div>
        ))}
      </div>
    </div>
  );
}
