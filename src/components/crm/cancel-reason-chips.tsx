"use client";

/**
 * Standard COD cancellation reasons. Stored as the plain reason text (no schema
 * change), so they stay consistent and searchable; agents can still type freely.
 */
export const CANCEL_REASONS = [
  "Faux numéro",
  "Injoignable (3 tentatives)",
  "Client a refusé",
  "Commande en double",
  "Commande test / spam",
  "Prix trop élevé",
  "Délai de livraison trop long",
  "Hors zone de livraison",
] as const;

export function CancelReasonChips({
  value,
  onPick,
  disabled,
}: {
  value: string;
  onPick: (reason: string) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label="Motifs fréquents" className="flex flex-wrap gap-1.5">
      {CANCEL_REASONS.map((reason) => (
        <button
          key={reason}
          type="button"
          disabled={disabled}
          aria-pressed={value === reason}
          onClick={() => onPick(reason)}
          className="min-h-8 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 aria-pressed:border-destructive aria-pressed:text-destructive"
        >
          {reason}
        </button>
      ))}
    </div>
  );
}
