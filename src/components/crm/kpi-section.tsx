import Link from "next/link";

import type { KpiAgentRow, KpiGroupRow, KpiPreset, Kpis } from "@/lib/services/kpis";
import { cn } from "@/lib/utils";

// Business KPI section for the CRM dashboard (task-31). Server component:
// the range picker is plain links plus a GET form, so no client JS is shipped.
// Money tiles/columns render only when the service returned them (admin).

const PRESETS: { id: Exclude<KpiPreset, "custom">; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "7d", label: "7 j" },
  { id: "30d", label: "30 j" },
  { id: "month", label: "Ce mois" },
];

const ND = "n/d";
const mad = (n: number | null) => (n === null ? ND : `${n.toLocaleString("fr-FR")} MAD`);
const pc = (n: number | null) => (n === null ? ND : `${n.toLocaleString("fr-FR", { minimumFractionDigits: 1 })} %`);
const num = (n: number | null) => (n === null ? ND : n.toLocaleString("fr-FR"));

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate font-semibold text-xl tabular-nums", value === ND && "text-muted-foreground")}>
        {value}
      </p>
      {sub ? (
        <p className={cn("mt-0.5 text-xs", tone === "warn" ? "text-[var(--crm-warning)]" : "text-muted-foreground")}>{sub}</p>
      ) : null}
    </div>
  );
}

function Table({ title, head, children, empty }: { title: string; head: string[]; children: React.ReactNode; empty: boolean }) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {empty ? (
        <p className="mt-3 text-sm text-muted-foreground">Aucune donnée sur la période.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                {head.map((h, i) => (
                  <th key={h} className={cn("whitespace-nowrap py-1 pr-3 font-normal", i > 0 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">{children}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const Td = ({ children, first }: { children: React.ReactNode; first?: boolean }) => (
  <td className={cn("whitespace-nowrap py-1 pr-3", first ? "max-w-[10rem] truncate" : "text-right")}>{children}</td>
);

function GroupRows({ rows, label, withSpend }: { rows: KpiGroupRow[]; label: (k: string) => string; withSpend: boolean }) {
  return rows.map((r) => (
    <tr key={r.key} className="border-t border-border/60">
      <Td first>{label(r.key)}</Td>
      <Td>{r.orders}</Td>
      <Td>{r.confirmed}</Td>
      <Td>{r.delivered}</Td>
      {r.revenue !== undefined ? <Td>{mad(r.revenue)}</Td> : null}
      {withSpend && r.adSpend !== undefined ? <Td>{mad(r.adSpend)}</Td> : null}
      {withSpend && r.roas !== undefined ? <Td>{r.roas === null ? ND : r.roas.toLocaleString("fr-FR")}</Td> : null}
    </tr>
  ));
}

function AgentRows({ rows }: { rows: KpiAgentRow[] }) {
  return rows.map((r) => (
    <tr key={r.agentId ?? "none"} className="border-t border-border/60">
      <Td first>{r.name}</Td>
      <Td>{r.orders}</Td>
      <Td>{r.confirmed}</Td>
      <Td>{pc(r.confirmationRate)}</Td>
      <Td>{r.delivered}</Td>
      <Td>{r.refused}</Td>
      <Td>{pc(r.deliveryRate)}</Td>
    </tr>
  ));
}

export function KpiSection({ kpis, preset }: { kpis: Kpis; preset: KpiPreset }) {
  const { counts: c, money: m } = kpis;
  const isAdmin = m !== undefined;
  const sourceHead = ["Source", "Commandes", "Confirmées", "Livrées", ...(isAdmin ? ["CA livré"] : [])];
  const campaignHead = [...sourceHead.map((h) => (h === "Source" ? "Campagne" : h)), ...(isAdmin ? ["Dépenses pub", "ROAS"] : [])];

  return (
    <section className="space-y-4" aria-labelledby="kpi-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="kpi-title" className="font-semibold text-lg text-foreground">Indicateurs de performance</h2>
          <p className="text-xs text-muted-foreground">Du {kpis.from} au {kpis.to} (Casablanca), commandes créées sur la période.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Link
              key={p.id}
              href={`/crm?range=${p.id}`}
              aria-current={preset === p.id ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm",
                preset === p.id ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </Link>
          ))}
          <form method="get" action="/crm" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="range" value="custom" />
            <label className="sr-only" htmlFor="kpi-from">Du</label>
            <input id="kpi-from" type="date" name="from" defaultValue={kpis.from} required className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            <label className="sr-only" htmlFor="kpi-to">Au</label>
            <input id="kpi-to" type="date" name="to" defaultValue={kpis.to} required className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            <button type="submit" className={cn("rounded-full border px-3 py-1.5 text-sm", preset === "custom" ? "border-foreground bg-foreground text-background" : "border-border")}>
              Personnalisé
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Tile label="Commandes" value={num(c.orders)} sub={`${c.stillNew} nouvelle(s), ${c.cancelled} annulée(s)`} />
        <Tile label="Taux de confirmation" value={pc(c.confirmationRate)} sub={`${c.confirmed} confirmée(s) sur ${c.orders - c.stillNew} traitée(s)`} />
        <Tile label="Taux de livraison" value={pc(c.deliveryRate)} sub={`${c.delivered} livrée(s), ${c.pendingOutcome} en attente de résultat`} />
        <Tile label="Taux de refus" value={pc(c.refusalRate)} sub={`${c.refused} refusée(s)`} />
        {m ? (
          <>
            <Tile label="CA livré" value={mad(m.revenueDelivered)} />
            <Tile label="Encaissé" value={mad(m.cashCollected)} sub={`Frais transporteur relevés : ${mad(m.courierFees)}`} />
            <Tile label="Reste à encaisser" value={mad(m.outstanding)} sub="Commandes livrées non payées" />
            <Tile
              label="Coût produits (coût actuel)"
              value={mad(m.cogs)}
              sub={m.missingCostLines > 0 ? `${m.missingCostLines} ligne(s) sans coût : renseignez les prix de revient` : undefined}
              tone="warn"
            />
            <Tile
              label="Coût transporteur"
              value={mad(m.courierCost)}
              sub={m.missingTariff > 0 ? `${m.missingTariff} commande(s) sans tarif` : "Livrées et refusées"}
              tone={m.missingTariff > 0 ? "warn" : undefined}
            />
            <Tile label="Dépenses pub" value={mad(m.adSpend)} sub={m.adSpend === null ? "Aucune dépense saisie" : undefined} />
            <Tile label="Marge (avant pub)" value={mad(m.margin)} />
            <Tile label="Bénéfice net" value={mad(m.netProfit)} />
            <Tile label="ROAS" value={m.roas === null ? ND : m.roas.toLocaleString("fr-FR")} />
            <Tile label="Coût / commande confirmée" value={mad(m.cpaConfirmed)} />
            <Tile label="Coût / commande livrée" value={mad(m.cpaDelivered)} />
          </>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="Par source" head={sourceHead} empty={kpis.bySource.length === 0}>
          <GroupRows rows={kpis.bySource} label={(k) => k || "Direct / inconnu"} withSpend={false} />
        </Table>
        <Table title="Par campagne" head={campaignHead} empty={kpis.byCampaign.length === 0}>
          <GroupRows rows={kpis.byCampaign} label={(k) => k} withSpend />
        </Table>
        <Table
          title="Par agent"
          head={["Agent", "Commandes", "Confirmées", "Taux conf.", "Livrées", "Refusées", "Taux livr."]}
          empty={kpis.byAgent.length === 0}
        >
          <AgentRows rows={kpis.byAgent} />
        </Table>
        <Table
          title="Top produits livrés"
          head={["Produit", "Unités", ...(isAdmin ? ["CA"] : [])]}
          empty={kpis.topProducts.length === 0}
        >
          {kpis.topProducts.map((p) => (
            <tr key={p.productId} className="border-t border-border/60">
              <Td first>{p.name}</Td>
              <Td>{p.units}</Td>
              {p.revenue !== undefined ? <Td>{mad(p.revenue)}</Td> : null}
            </tr>
          ))}
        </Table>
      </div>
    </section>
  );
}
