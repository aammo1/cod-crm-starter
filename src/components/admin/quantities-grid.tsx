"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

export interface QuantityCell {
  id: string;
  label?: string;
  sku?: string;
  colorId?: string;
  colorName?: string;
  size?: string;
  disabled?: boolean;
  detail?: ReactNode;
}

/** Stable variant-keyed inputs, readable without a niche-specific matrix. */
export function QuantitiesGrid({ cells, values, onChange, disabled, min = 0 }: {
  cells: QuantityCell[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  disabled?: boolean;
  min?: number;
}) {
  return <div role="group" aria-label="Quantités par variante" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {cells.map(cell => {
      const label = cell.label ?? ([cell.colorName, cell.size].filter(Boolean).join(' / ') || 'Standard');
      return <label key={cell.id} className="min-w-0 space-y-2 rounded-lg border border-border p-3">
        <span className="block break-words text-sm font-medium">{label}</span>
        {cell.sku && <span className="block break-all font-mono text-xs text-muted-foreground">{cell.sku}</span>}
        <Input type="number" inputMode="numeric" min={min} step={1} value={values[cell.id] ?? ''} disabled={disabled || cell.disabled} onChange={event => onChange(cell.id, event.target.value)} aria-label={`${label} — quantité`} placeholder={cell.disabled ? '—' : 'Vide'} className="bg-background text-foreground tabular-nums" />
        {cell.detail && <span className="block text-xs leading-relaxed text-muted-foreground">{cell.detail}</span>}
      </label>;
    })}
  </div>;
}
