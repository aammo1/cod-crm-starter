"use client";

import type { ProductPack } from "@/lib/commerce-types";
import type { LandingLabels } from "@/config/i18n";

export const fillLabel = (template: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), template);

/** Large radio cards: quantity 1 at the base price, then each pack. Prices are display only. */
export function PackSelector({ packs, basePrice, qty, onChange, labels }: {
  packs: ProductPack[]; basePrice: number; qty: number; onChange: (qty: number) => void; labels: LandingLabels;
}) {
  const price = (n: number) => `${n} ${labels.currency}`;
  const options = [
    { id: "single", quantity: 1, price: basePrice, label: undefined as string | undefined, highlight: false },
    ...packs,
  ];
  return (
    <div role="radiogroup" aria-label={labels.packs} className="grid gap-2">
      {options.map((p) => {
        const regular = p.quantity * basePrice;
        const selected = qty === p.quantity;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(p.quantity)}
            className={`relative flex min-h-16 items-center justify-between gap-3 rounded-store border-2 px-4 py-3 text-start ${
              selected ? "border-store-primary bg-store-muted" : "border-store-border"
            }`}
          >
            {p.highlight && (
              <span className="absolute -top-2.5 end-3 rounded-store bg-store-accent px-2 py-0.5 text-xs font-semibold text-store-accent-fg">
                {p.label ?? labels.bestValue}
              </span>
            )}
            <span className="flex items-center gap-3">
              <span aria-hidden className={`size-5 shrink-0 rounded-full border-2 ${selected ? "border-store-primary bg-store-primary" : "border-store-border"}`} />
              <span className="font-semibold">
                {fillLabel(p.quantity === 1 ? labels.piece : labels.pieces, { n: p.quantity })}
              </span>
            </span>
            <span className="text-end">
              <strong className="block text-lg tabular-nums">{price(p.price)}</strong>
              {p.price < regular && (
                <span className="block text-xs">
                  <s className="opacity-60">{price(regular)}</s>{" "}
                  <span className="font-medium text-store-accent">{fillLabel(labels.save, { amount: price(regular - p.price) })}</span>
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
