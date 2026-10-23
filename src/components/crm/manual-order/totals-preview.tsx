import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatMad, type ShippingRules } from "@/lib/pricing";

export function TotalsPreview({
  itemsSubtotal,
  packDiscount,
  shipping,
  estimatedTotal,
  shippingRules,
  isSubmitting,
  hasUncertain,
  isModifiedSinceUncertain,
}: {
  itemsSubtotal: number;
  packDiscount: number;
  shipping: number;
  estimatedTotal: number;
  shippingRules: ShippingRules;
  isSubmitting: boolean;
  hasUncertain: boolean;
  isModifiedSinceUncertain: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Estimation du montant
          </h2>
          <div className="text-xs text-muted-foreground">
            Calcul indicatif basé sur le catalogue. Les totaux définitifs sont calculés et fixés par le serveur.
          </div>
          <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Sous-total : </span>
              <span className="font-semibold tabular-nums text-foreground">{formatMad(itemsSubtotal)}</span>
            </div>
            {packDiscount > 0 && (
              <div>
                <span className="text-muted-foreground">Remise pack : </span>
                <span className="font-semibold tabular-nums text-foreground">-{formatMad(packDiscount)}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Livraison : </span>
              <span className="font-semibold tabular-nums text-foreground">
                {itemsSubtotal === 0
                  ? "—"
                  : shipping === 0
                  ? `Offerte (dès ${formatMad(shippingRules.freeShippingThresholdMad)})`
                  : formatMad(shipping)}
              </span>
            </div>
            <div className="border-l border-border pl-6">
              <span className="text-muted-foreground">Total estimé : </span>
              <span className="text-base font-bold tabular-nums text-foreground">{formatMad(estimatedTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm font-medium text-muted-foreground">
          La commande sera créée en Nouvelle. Le stock sera réservé à la confirmation.
        </p>

        <div className="flex items-center gap-3 shrink-0">
          <Button asChild variant="ghost" disabled={isSubmitting} className="text-muted-foreground hover:text-foreground">
            <Link href="/crm/orders">Annuler</Link>
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || (hasUncertain && isModifiedSinceUncertain)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 font-medium min-h-[44px]"
          >
            {isSubmitting
              ? "Création en cours…"
              : hasUncertain && !isModifiedSinceUncertain
              ? "Réessayer la commande"
              : "Créer la commande"}
          </Button>
        </div>
      </div>
    </section>
  );
}
