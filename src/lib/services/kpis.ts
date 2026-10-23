import { getDb } from "@/lib/db";
import { adSpendTotals } from "@/lib/services/ad-spend";
import { defaultCourierCost } from "@/lib/services/city-tariffs";
import { casablancaLocalToUtcIso } from "@/lib/services/orders";

// Business KPIs for the /crm dashboard (task-31). Every figure is a SQL
// aggregate over the orders created in an inclusive Africa/Casablanca day
// range (archived orders excluded; the schema has no "test order" flag).
//
// Definitions:
//  - confirmationRate = confirmed / (orders - still-new); cancelled stay in the divisor.
//  - deliveryRate / refusalRate = delivered|refused / (delivered + refused) among
//    confirmed orders that have a delivery outcome; pendingOutcome = confirmed, no outcome.
//  - revenueDelivered = sum(orders.total) of delivered orders.
//  - cashCollected = sum(paid_amount) of remittance lines of delivered orders;
//    outstanding = sum(total) of delivered orders whose cod_status is not 'paid'.
//  - cogs = sum(qty x CURRENT variant cost_price) over items_json (+ upsell items when the
//    upsell was accepted) of delivered orders. null (n/d) when any line has no cost.
//  - courierCost = per delivered-or-refused order: city tariff cost, else the default courier
//    cost; refused parcels cost too. Where neither exists the remittance fee_amount of that
//    order is used instead (never both). Orders with neither are counted in missingTariff.
//    courierFees = sum(fee_amount) of delivered-order remittance lines (informational).
//  - adSpend = sum(ad_spend.amount) for days in range; null (n/d) when nothing recorded.
//  - margin = revenue - cogs - courierCost (null when cogs unknown);
//    netProfit = margin - adSpend (null when either unknown).
//  - cpaConfirmed/cpaDelivered = round(adSpend / count); roas = revenue / adSpend (2 dp);
//    all null on a zero/unknown divisor.
// Money figures exist only in the admin result: agents get counts and rates.

export type KpiRole = "admin" | "agent";

export class KpiRangeError extends Error {
  constructor(message = "Période invalide.") {
    super(message);
    this.name = "KpiRangeError";
  }
}

export interface KpiCounts {
  orders: number;
  stillNew: number;
  confirmed: number;
  cancelled: number;
  delivered: number;
  refused: number;
  pendingOutcome: number;
  confirmationRate: number | null;
  deliveryRate: number | null;
  refusalRate: number | null;
}

export interface KpiMoney {
  revenueDelivered: number;
  cashCollected: number;
  outstanding: number;
  courierFees: number;
  cogs: number | null;
  missingCostLines: number;
  courierCost: number;
  missingTariff: number;
  adSpend: number | null;
  margin: number | null;
  netProfit: number | null;
  cpaConfirmed: number | null;
  cpaDelivered: number | null;
  roas: number | null;
}

export interface KpiGroupRow {
  key: string;
  orders: number;
  confirmed: number;
  delivered: number;
  revenue?: number;
  adSpend?: number | null;
  roas?: number | null;
}

export interface KpiAgentRow {
  agentId: string | null;
  name: string;
  orders: number;
  confirmed: number;
  delivered: number;
  refused: number;
  confirmationRate: number | null;
  deliveryRate: number | null;
}

export interface KpiProductRow {
  productId: string;
  name: string;
  units: number;
  revenue?: number;
}

export interface Kpis {
  from: string;
  to: string;
  counts: KpiCounts;
  money?: KpiMoney;
  bySource: KpiGroupRow[];
  byCampaign: KpiGroupRow[];
  byAgent: KpiAgentRow[];
  topProducts: KpiProductRow[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function dayMs(day: string): number {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (!DAY_RE.test(day) || Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== day) {
    throw new KpiRangeError();
  }
  return ms;
}

export function addDays(day: string, n: number): string {
  return new Date(dayMs(day) + n * 86_400_000).toISOString().slice(0, 10);
}

export function casablancaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** [startIso, endIso) in UTC for an inclusive Casablanca day range. */
export function kpiRangeBounds(from: string, to: string): { start: string; end: string } {
  const a = dayMs(from);
  const b = dayMs(to);
  if (a > b || (b - a) / 86_400_000 >= MAX_RANGE_DAYS) throw new KpiRangeError();
  const start = casablancaLocalToUtcIso(`${from}T00:00`);
  const end = casablancaLocalToUtcIso(`${addDays(to, 1)}T00:00`);
  if (!start || !end) throw new KpiRangeError();
  return { start, end };
}

export type KpiPreset = "today" | "7d" | "30d" | "month" | "custom";

/** Resolves search params to a valid range; falls back to today on bad input. */
export function resolveKpiRange(
  params: { range?: string; from?: string; to?: string },
  now: Date = new Date(),
): { preset: KpiPreset; from: string; to: string } {
  const today = casablancaToday(now);
  switch (params.range) {
    case "7d": return { preset: "7d", from: addDays(today, -6), to: today };
    case "30d": return { preset: "30d", from: addDays(today, -29), to: today };
    case "month": return { preset: "month", from: `${today.slice(0, 8)}01`, to: today };
    case "custom":
      try {
        if (params.from && params.to) {
          kpiRangeBounds(params.from, params.to);
          return { preset: "custom", from: params.from, to: params.to };
        }
      } catch { /* fall through */ }
      return { preset: "today", from: today, to: today };
    default: return { preset: "today", from: today, to: today };
  }
}

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : null;

// Order cohort + its line items (items_json and accepted upsell items).
const COHORT_SQL = `
  cohort AS (
    SELECT id, total, city_id, assigned_to, confirmation_status, delivery_outcome, cod_status,
           items_json, upsell_status, upsell_items_json, utm_source, utm_campaign
      FROM orders
     WHERE archived_at IS NULL AND created_at >= @start AND created_at < @end
  ),
  delivered AS (
    SELECT * FROM cohort WHERE confirmation_status = 'confirmed' AND delivery_outcome = 'delivered'
  ),
  lines AS (
    SELECT d.id AS order_id, json_extract(j.value, '$.product_id') AS product_id,
           json_extract(j.value, '$.variant_id') AS variant_id, json_extract(j.value, '$.name') AS name,
           json_extract(j.value, '$.quantity') AS qty, json_extract(j.value, '$.line_total') AS line_total
      FROM delivered d, json_each(d.items_json) j
    UNION ALL
    SELECT d.id, json_extract(j.value, '$.product_id'), json_extract(j.value, '$.variant_id'),
           json_extract(j.value, '$.name'), json_extract(j.value, '$.quantity'),
           json_extract(j.value, '$.line_total')
      FROM delivered d, json_each(CASE WHEN d.upsell_status = 'accepted' AND json_valid(d.upsell_items_json)
                                       THEN d.upsell_items_json ELSE '[]' END) j
  )`;

interface CountsRow {
  orders: number; still_new: number; confirmed: number; cancelled: number;
  delivered: number; refused: number; pending_outcome: number;
}

export function getKpis(params: { from: string; to: string; role: KpiRole }): Kpis {
  const { start, end } = kpiRangeBounds(params.from, params.to);
  const isAdmin = params.role === "admin"; // fail closed for anything else
  const db = getDb();
  const bind = { start, end };

  const c = db.prepare(
    `WITH ${COHORT_SQL}
     SELECT COUNT(*) AS orders,
       COALESCE(SUM(confirmation_status = 'new'), 0) AS still_new,
       COALESCE(SUM(confirmation_status = 'confirmed'), 0) AS confirmed,
       COALESCE(SUM(confirmation_status = 'cancelled'), 0) AS cancelled,
       COALESCE(SUM(confirmation_status = 'confirmed' AND delivery_outcome = 'delivered'), 0) AS delivered,
       COALESCE(SUM(confirmation_status = 'confirmed' AND delivery_outcome = 'refused'), 0) AS refused,
       COALESCE(SUM(confirmation_status = 'confirmed' AND delivery_outcome IS NULL), 0) AS pending_outcome
     FROM cohort`,
  ).get(bind) as CountsRow;

  const counts: KpiCounts = {
    orders: c.orders, stillNew: c.still_new, confirmed: c.confirmed, cancelled: c.cancelled,
    delivered: c.delivered, refused: c.refused, pendingOutcome: c.pending_outcome,
    confirmationRate: pct(c.confirmed, c.orders - c.still_new),
    deliveryRate: pct(c.delivered, c.delivered + c.refused),
    refusalRate: pct(c.refused, c.delivered + c.refused),
  };

  let money: KpiMoney | undefined;
  let spendByCampaign = new Map<string, number>();
  if (isAdmin) {
    const rev = db.prepare(
      `WITH ${COHORT_SQL}
       SELECT COALESCE(SUM(d.total), 0) AS revenue,
              COALESCE(SUM(CASE WHEN d.cod_status <> 'paid' THEN d.total END), 0) AS outstanding,
              COALESCE(SUM(l.paid_amount), 0) AS cash, COALESCE(SUM(l.fee_amount), 0) AS fees
         FROM delivered d LEFT JOIN cod_remittance_lines l ON l.order_id = d.id`,
    ).get(bind) as { revenue: number; outstanding: number; cash: number; fees: number };

    const cost = db.prepare(
      `WITH ${COHORT_SQL}
       SELECT SUM(l.qty * v.cost_price) AS cogs,
              COALESCE(SUM(v.cost_price IS NULL), 0) AS missing
         FROM lines l LEFT JOIN variants v ON v.id = l.variant_id`,
    ).get(bind) as { cogs: number | null; missing: number };

    const dflt = defaultCourierCost();
    const ship = db.prepare(
      `WITH ${COHORT_SQL}
       SELECT COALESCE(SUM(COALESCE(t.courier_cost, @dflt)), 0) AS tariff_cost,
              COALESCE(SUM(CASE WHEN COALESCE(t.courier_cost, @dflt) IS NULL THEN rl.fee_amount END), 0) AS fee_fallback,
              COALESCE(SUM(COALESCE(t.courier_cost, @dflt) IS NULL AND rl.order_id IS NULL), 0) AS missing
         FROM cohort o
         LEFT JOIN city_tariffs t ON t.city_id = o.city_id
         LEFT JOIN cod_remittance_lines rl ON rl.order_id = o.id
        WHERE o.confirmation_status = 'confirmed' AND o.delivery_outcome IS NOT NULL`,
    ).get({ ...bind, dflt }) as { tariff_cost: number; fee_fallback: number; missing: number };

    const spendRows = adSpendTotals({ from: params.from, to: params.to, groupBy: "channel" });
    const adSpend = spendRows.length ? spendRows.reduce((s, r) => s + r.amount, 0) : null;
    spendByCampaign = new Map(
      adSpendTotals({ from: params.from, to: params.to, groupBy: "campaign" })
        .filter((r) => r.key !== "").map((r) => [r.key, r.amount]),
    );

    const cogs = cost.missing > 0 ? null : (cost.cogs ?? 0);
    const courierCost = ship.tariff_cost + ship.fee_fallback;
    const margin = cogs === null ? null : rev.revenue - cogs - courierCost;
    money = {
      revenueDelivered: rev.revenue, cashCollected: rev.cash, outstanding: rev.outstanding,
      courierFees: rev.fees, cogs, missingCostLines: cost.missing, courierCost,
      missingTariff: ship.missing, adSpend, margin,
      netProfit: margin === null || adSpend === null ? null : margin - adSpend,
      cpaConfirmed: adSpend !== null && c.confirmed > 0 ? Math.round(adSpend / c.confirmed) : null,
      cpaDelivered: adSpend !== null && c.delivered > 0 ? Math.round(adSpend / c.delivered) : null,
      roas: adSpend !== null && adSpend > 0 ? Math.round((rev.revenue / adSpend) * 100) / 100 : null,
    };
  }

  const group = (column: "utm_source" | "utm_campaign"): KpiGroupRow[] => {
    const rows = db.prepare(
      `WITH ${COHORT_SQL}
       SELECT COALESCE(NULLIF(${column}, ''), '') AS key, COUNT(*) AS orders,
              SUM(confirmation_status = 'confirmed') AS confirmed,
              SUM(confirmation_status = 'confirmed' AND delivery_outcome = 'delivered') AS delivered,
              COALESCE(SUM(CASE WHEN confirmation_status = 'confirmed' AND delivery_outcome = 'delivered'
                                THEN total END), 0) AS revenue
         FROM cohort GROUP BY key ORDER BY orders DESC, key ASC`,
    ).all(bind) as { key: string; orders: number; confirmed: number; delivered: number; revenue: number }[];
    const out: KpiGroupRow[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      if (column === "utm_campaign" && r.key === "") continue; // no campaign: nothing to join spend on
      seen.add(r.key);
      const row: KpiGroupRow = { key: r.key, orders: r.orders, confirmed: r.confirmed, delivered: r.delivered };
      if (isAdmin) {
        row.revenue = r.revenue;
        if (column === "utm_campaign") {
          const spend = spendByCampaign.get(r.key) ?? null;
          row.adSpend = spend;
          row.roas = spend && spend > 0 ? Math.round((r.revenue / spend) * 100) / 100 : null;
        }
      }
      out.push(row);
    }
    if (isAdmin && column === "utm_campaign") {
      for (const [key, spend] of spendByCampaign) {
        if (!seen.has(key)) out.push({ key, orders: 0, confirmed: 0, delivered: 0, revenue: 0, adSpend: spend, roas: spend > 0 ? 0 : null });
      }
    }
    return out;
  };

  const agentRows = db.prepare(
    `WITH ${COHORT_SQL}
     SELECT o.assigned_to AS agent_id, u.name AS name, COUNT(*) AS orders,
            SUM(o.confirmation_status = 'confirmed') AS confirmed,
            SUM(o.confirmation_status = 'new') AS still_new,
            SUM(o.confirmation_status = 'confirmed' AND o.delivery_outcome = 'delivered') AS delivered,
            SUM(o.confirmation_status = 'confirmed' AND o.delivery_outcome = 'refused') AS refused
       FROM cohort o LEFT JOIN users u ON u.id = o.assigned_to
      GROUP BY o.assigned_to ORDER BY orders DESC, name ASC`,
  ).all(bind) as { agent_id: string | null; name: string | null; orders: number; confirmed: number;
    still_new: number; delivered: number; refused: number }[];
  const byAgent: KpiAgentRow[] = agentRows.map((r) => ({
    agentId: r.agent_id, name: r.name ?? (r.agent_id ? "Agent supprimé" : "Non assigné"),
    orders: r.orders, confirmed: r.confirmed, delivered: r.delivered, refused: r.refused,
    confirmationRate: pct(r.confirmed, r.orders - r.still_new),
    deliveryRate: pct(r.delivered, r.delivered + r.refused),
  }));

  const topProducts = (db.prepare(
    `WITH ${COHORT_SQL}
     SELECT product_id, MAX(name) AS name, SUM(qty) AS units, SUM(line_total) AS revenue
       FROM lines GROUP BY product_id ORDER BY units DESC, product_id ASC LIMIT 10`,
  ).all(bind) as { product_id: string; name: string; units: number; revenue: number }[]).map((r) => {
    const row: KpiProductRow = { productId: r.product_id, name: r.name, units: r.units };
    if (isAdmin) row.revenue = r.revenue;
    return row;
  });

  return {
    from: params.from, to: params.to, counts, ...(money ? { money } : {}),
    bySource: group("utm_source"), byCampaign: group("utm_campaign"), byAgent, topProducts,
  };
}
