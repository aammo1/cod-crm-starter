import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PackageOpenIcon,
  PackageSearchIcon,
  ScanSearchIcon,
  Undo2Icon,
} from "lucide-react";

import { ReceiveReturnButton, ReturnInspectForm, type InspectLine } from "@/components/crm/return-inspect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth-guards";
import { getDb } from "@/lib/db";
import type { CommerceOrderItem as OrderItem } from "@/lib/commerce-types";
import { getDispatchedVariants, resolveVariantForLine } from "@/lib/services/inventory";
import { formatCasablanca, summarizeItems } from "@/lib/services/orders";
import { declareManualReturn } from "@/lib/services/returns";

export const metadata: Metadata = {
  title: "Retours — CRM",
  robots: { index: false },
};

type ReturnStatus = "returning" | "received" | "inspected";

interface ReturnCard {
  id: string;
  submissionId: string;
  status: ReturnStatus;
  sellableQty: number;
  damagedQty: number;
  reason: string | null;
  receivedAt: string | null;
  inspectedAt: string | null;
  createdAt: string;
  orderId: string;
  trackingNumber: string | null;
  rawStatus: string | null;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  upsellStatus: string;
  upsellItems: OrderItem[];
  inspectActor: string | null;
}

interface ReturnQueryRow {
  id: string;
  submission_id: string;
  status: string;
  sellable_qty: number;
  damaged_qty: number;
  reason: string | null;
  received_at: string | null;
  inspected_at: string | null;
  created_at: string;
  order_id: string;
  tracking_number: string | null;
  raw_status: string | null;
  customer_name: string;
  customer_phone: string;
  items_json: string;
  upsell_status: string;
  upsell_items_json: string | null;
  inspect_actor: string | null;
}

function parseItems(json: string): OrderItem[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value as OrderItem[];
  } catch {
    return [];
  }
}

// Parcel content = main items + accepted upsell lines (same construction as
// shipping/parcel-payload.ts and the inspect route), each line flagged with
// whether its variant was actually dispatched (and so can be restocked).
function buildInspectLines(card: ReturnCard): InspectLine[] {
  const upsell = card.upsellStatus === "accepted" ? card.upsellItems : [];
  const parcelLines = [...card.items, ...upsell];
  const dispatched = new Set(
    getDispatchedVariants(card.orderId).map((d) => d.variantId),
  );
  return parcelLines.map((item, index) => ({
    lineIndex: index,
    name: item.name,
    variant_label: item.variant_label,
    options: item.options,
    quantity: item.quantity,
    upsell: index >= card.items.length,
    inspectable: (() => {
      const variantId = resolveVariantForLine(item);
      return variantId !== null && dispatched.has(variantId);
    })(),
  }));
}

function loadReturns(): ReturnCard[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.submission_id, r.status, r.sellable_qty, r.damaged_qty,
              r.reason, r.received_at, r.inspected_at, r.created_at,
              cs.order_id, cs.tracking_number, cs.raw_status,
              o.customer_name, o.customer_phone, o.items_json,
              o.upsell_status, o.upsell_items_json,
              COALESCE(r.inspected_by,
                (SELECT m.actor FROM stock_movements m
                  WHERE m.submission_id = r.submission_id
                    AND m.kind IN ('receive_sellable', 'receive_quarantine')
                  ORDER BY m.created_at DESC LIMIT 1)) AS inspect_actor
       FROM returns r
       JOIN courier_submissions cs ON cs.id = r.submission_id
       JOIN orders o ON o.id = cs.order_id
       ORDER BY r.created_at DESC, r.id DESC`,
    )
    .all() as ReturnQueryRow[];
  return rows.map((row) => ({
    id: row.id,
    submissionId: row.submission_id,
    status: row.status as ReturnStatus,
    sellableQty: row.sellable_qty,
    damagedQty: row.damaged_qty,
    reason: row.reason,
    receivedAt: row.received_at,
    inspectedAt: row.inspected_at,
    createdAt: row.created_at,
    orderId: row.order_id,
    trackingNumber: row.tracking_number,
    rawStatus: row.raw_status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    items: parseItems(row.items_json),
    upsellStatus: row.upsell_status,
    upsellItems: row.upsell_items_json ? parseItems(row.upsell_items_json) : [],
    inspectActor: row.inspect_actor,
  }));
}

function providerStatus(rawStatus: string | null): string {
  return rawStatus
    ? `Statut transporteur : ${rawStatus}`
    : "Statut transporteur inconnu";
}

function CardHeader({ card, dateLabel, date }: { card: ReturnCard; dateLabel: string; date: string | null }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href={`/crm/orders/${card.orderId}`}
          className="font-mono text-sm text-primary hover:underline"
        >
          {card.orderId}
        </Link>
        <span className="text-sm text-foreground">{card.customerName}</span>
        <span className="text-xs text-muted-foreground">{card.customerPhone}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-foreground/80">
        {summarizeItems(card.items) || "Articles illisibles"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Suivi : {card.trackingNumber ?? "—"}
        {" · "}
        {providerStatus(card.rawStatus)}
        {date ? ` · ${dateLabel} ${formatCasablanca(date)}` : ""}
      </p>
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function DeclareReturnForm() {
  return (
    <form action={declareReturn} className="flex max-w-md items-center gap-2">
      <Input
        name="tracking"
        placeholder="Numéro de suivi du colis refusé…"
        aria-label="Numéro de suivi"
        required
        className="h-9 border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring"
      />
      <Button type="submit" size="lg" variant="secondary" className="h-9 shrink-0">
        <Undo2Icon aria-hidden />
        Déclarer un retour
      </Button>
    </form>
  );
}

async function declareReturn(formData: FormData): Promise<void> {
  "use server";
  const user = await requireUser();
  const tracking = String(formData.get("tracking") ?? "").trim();
  if (!tracking) redirect("/crm/retours?declare=introuvable");
  if (!declareManualReturn(tracking, user.id)) redirect("/crm/retours?declare=introuvable");
  redirect("/crm/retours?declare=ok");
}

const DECLARE_MESSAGES: Record<string, string> = {
  ok: "Retour déclaré — il apparaît dans « Retours en cours ».",
  introuvable: "Aucun colis expédié avec ce numéro de suivi.",
};

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireUser();
  const sp = await searchParams;
  const declare = typeof sp.declare === "string" ? sp.declare : undefined;
  const declareMessage = declare ? DECLARE_MESSAGES[declare] : undefined;

  const cards = loadReturns();
  const incoming = cards.filter((card) => card.status === "returning");
  const toInspect = cards.filter((card) => card.status === "received");
  const inspected = cards.filter((card) => card.status === "inspected");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl text-foreground">Retours</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Colis refusés ou retournés signalés par le suivi transporteur.
        </p>
      </div>

      <p className="rounded-xl border border-[var(--crm-warning)]/40 bg-[var(--crm-warning-bg)] px-4 py-3 text-sm text-[var(--crm-warning)]">
        Un retour n&apos;est remis en vente qu&apos;après inspection.
      </p>

      {declareMessage ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            declare === "ok"
              ? "border-[var(--crm-success)]/40 bg-[var(--crm-success-bg)] text-[var(--crm-success)]"
              : "border-[var(--crm-danger)]/40 bg-[var(--crm-danger-bg)] text-[var(--crm-danger)]"
          }`}
        >
          {declareMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pipeline des retours
        </h2>
        <DeclareReturnForm />
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <PackageOpenIcon className="size-4" aria-hidden />
          Retours en cours
          <span className="text-muted-foreground/60">({incoming.length})</span>
        </h2>
        {incoming.length === 0 ? (
          <EmptyState>Aucun retour en cours.</EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {incoming.map((card) => (
              <article
                key={card.id}
                className="rounded-xl border border-border bg-card p-5 text-card-foreground"
              >
                <CardHeader
                  card={card}
                  dateLabel="Signalé le"
                  date={card.createdAt}
                />
                <div className="border-t border-border pt-3">
                  <ReceiveReturnButton returnId={card.id} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <ScanSearchIcon className="size-4" aria-hidden />
          À inspecter
          <span className="text-muted-foreground/60">({toInspect.length})</span>
        </h2>
        {toInspect.length === 0 ? (
          <EmptyState>Aucun colis à inspecter.</EmptyState>
        ) : (
          <div className="space-y-4">
            {toInspect.map((card) => (
              <article
                key={card.id}
                className="rounded-xl border border-border bg-card p-5 text-card-foreground"
              >
                <CardHeader
                  card={card}
                  dateLabel="Reçu le"
                  date={card.receivedAt}
                />
                <div className="border-t border-border pt-4">
                  <ReturnInspectForm
                    returnId={card.id}
                    isAdmin={viewer.role === "admin"}
                    lines={buildInspectLines(card)}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <PackageSearchIcon className="size-4" aria-hidden />
          Historique des inspections
          <span className="text-muted-foreground/60">({inspected.length})</span>
        </h2>
        {inspected.length === 0 ? (
          <EmptyState>Aucun retour inspecté pour le moment.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card text-card-foreground">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Inspecté le</th>
                  <th className="px-4 py-3 font-medium">Commande</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Vendables</th>
                  <th className="px-4 py-3 font-medium">Endommagées</th>
                  <th className="px-4 py-3 font-medium">Motif</th>
                  <th className="px-4 py-3 font-medium">Agent</th>
                </tr>
              </thead>
              <tbody>
                {inspected.map((card) => (
                  <tr
                    key={card.id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {card.inspectedAt ? formatCasablanca(card.inspectedAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/crm/orders/${card.orderId}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {card.orderId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{card.customerName}</td>
                    <td className="px-4 py-3 font-medium text-[var(--crm-success)]">
                      {card.sellableQty}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--crm-warning)]">
                      {card.damagedQty}
                    </td>
                    <td className="max-w-[240px] px-4 py-3 text-muted-foreground">
                      <span className="line-clamp-2">{card.reason ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {card.inspectActor ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
