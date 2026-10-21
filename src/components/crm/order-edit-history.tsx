import { formatMad } from "@/lib/pricing";
import { formatCasablanca } from "@/lib/services/orders";
import type { OrderEditHistory, OrderEditSnapshot } from "@/lib/services/order-edits";

function Snapshot({ value }: { value: OrderEditSnapshot }) {
  return <div className="flex flex-col gap-2 text-sm">
    <ul className="flex flex-col gap-1">{[...value.items, ...value.upsellItems].map((item, index) =>
      <li key={index}>{item.quantity} × {item.name} · {item.color} / {item.size}{index >= value.items.length ? " · Upsell" : ""} — {formatMad(item.line_total)}</li>)}</ul>
    <p>Remise : {formatMad(value.discountAmount)}{value.discountType === "percent" ? ` (${value.discountValue} %)` : ""} · Livraison : {formatMad(value.shipping)} ({({ auto: "automatique", free: "gratuite", paid: "payante" })[value.shippingMode]})</p>
    <p className="font-semibold">À encaisser : {formatMad(value.total)}</p>
  </div>;
}

export function OrderEditHistoryList({ entries }: { entries: OrderEditHistory[] }) {
  if (!entries.length) return null;
  return <section className="rounded-xl border border-border bg-card p-5 text-card-foreground">
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historique des modifications</h2>
    <ul className="flex flex-col gap-4">{entries.map((entry) => <li key={entry.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
      <p className="text-sm font-medium">{entry.actorName} <span className="font-normal text-muted-foreground">· {formatCasablanca(entry.createdAt)}</span></p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{entry.reason}</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-muted-foreground">Voir les changements · {formatMad(entry.before.total)} → {formatMad(entry.after.total)}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3"><h3 className="text-xs font-semibold uppercase text-muted-foreground">Avant</h3><Snapshot value={entry.before} /></div>
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3"><h3 className="text-xs font-semibold uppercase text-muted-foreground">Après</h3><Snapshot value={entry.after} /></div>
        </div>
      </details>
    </li>)}</ul>
  </section>;
}
