import type { OrderAttribution } from "@/lib/services/orders";

const ROWS: Array<[string, keyof OrderAttribution]> = [
  ["Source", "utmSource"],
  ["Medium", "utmMedium"],
  ["Campagne", "utmCampaign"],
  ["Contenu", "utmContent"],
  ["Terme", "utmTerm"],
  ["Référent", "referrerHost"],
  ["Page d’arrivée", "landingPath"],
];

/** First-touch origin of a storefront order; renders nothing when no value was captured. */
export function OrderAttributionCard({ attribution }: { attribution: OrderAttribution | null }) {
  if (!attribution) return null;
  const rows = ROWS.filter(([, key]) => attribution[key]);
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-card-foreground">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Origine de la commande
      </h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([label, key]) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="break-words">{attribution[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
