import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  adSpendGroupBySchema,
  adSpendInputSchema,
  adSpendRangeSchema,
  type AdChannel,
  type AdSpendInput,
} from "@/lib/ad-spend-schemas";

export type AdSpendEntry = {
  id: string;
  day: string;
  channel: AdChannel;
  campaign: string;
  amount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdSpendGroupBy = "channel" | "campaign" | "day";
export type AdSpendTotal = { key: string; amount: number };

export class AdSpendError extends Error {
  status: 400 | 404;
  constructor(status: 400 | 404, message: string) {
    super(message);
    this.name = "AdSpendError";
    this.status = status;
  }
}

interface Row {
  id: string;
  day: string;
  channel: AdChannel;
  campaign: string;
  amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function toEntry(r: Row): AdSpendEntry {
  return {
    id: r.id, day: r.day, channel: r.channel, campaign: r.campaign,
    amount: r.amount, note: r.note, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function parseRange(range: { from: string; to: string }) {
  const parsed = adSpendRangeSchema.safeParse(range);
  if (!parsed.success) throw new AdSpendError(400, "Période invalide.");
  if (parsed.data.from > parsed.data.to) throw new AdSpendError(400, "Période invalide.");
  return parsed.data;
}

/** Inclusive range of Africa/Casablanca calendar days (YYYY-MM-DD). */
export function listAdSpend(range: { from: string; to: string }): AdSpendEntry[] {
  const { from, to } = parseRange(range);
  const rows = getDb()
    .prepare(
      `SELECT id, day, channel, campaign, amount, note, created_at, updated_at
       FROM ad_spend WHERE day BETWEEN ? AND ?
       ORDER BY day DESC, channel ASC, campaign ASC`,
    )
    .all(from, to) as Row[];
  return rows.map(toEntry);
}

export function upsertAdSpend(input: unknown, actorId: string | null): AdSpendEntry {
  const parsed = adSpendInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AdSpendError(400, parsed.error.issues[0]?.message ?? "Données invalides.");
  }
  const data: AdSpendInput = parsed.data;
  const now = new Date().toISOString();
  const db = getDb();
  const row = db.transaction(() => {
    db.prepare(
      `INSERT INTO ad_spend (id, day, channel, campaign, amount, note, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (day, channel, campaign) DO UPDATE SET
         amount = excluded.amount, note = excluded.note, updated_at = excluded.updated_at`,
    ).run(nanoid(), data.day, data.channel, data.campaign, data.amount, data.note || null, actorId, now, now);
    return db
      .prepare(
        `SELECT id, day, channel, campaign, amount, note, created_at, updated_at
         FROM ad_spend WHERE day = ? AND channel = ? AND campaign = ?`,
      )
      .get(data.day, data.channel, data.campaign) as Row;
  })();
  return toEntry(row);
}

export function deleteAdSpend(id: string): void {
  const result = getDb().prepare("DELETE FROM ad_spend WHERE id = ?").run(id);
  if (result.changes === 0) throw new AdSpendError(404, "Dépense introuvable.");
}

export function adSpendTotals(params: {
  from: string;
  to: string;
  groupBy: AdSpendGroupBy;
}): AdSpendTotal[] {
  const { from, to } = parseRange(params);
  const groupBy = adSpendGroupBySchema.safeParse(params.groupBy);
  if (!groupBy.success) throw new AdSpendError(400, "Regroupement invalide.");
  const column = { channel: "channel", campaign: "campaign", day: "day" }[groupBy.data];
  const rows = getDb()
    .prepare(
      `SELECT ${column} AS key, SUM(amount) AS amount FROM ad_spend
       WHERE day BETWEEN ? AND ? GROUP BY ${column} ORDER BY ${column} ASC`,
    )
    .all(from, to) as AdSpendTotal[];
  return rows.map((r) => ({ key: r.key, amount: Number(r.amount) }));
}
