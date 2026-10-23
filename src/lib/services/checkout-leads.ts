import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { normalizeMaPhone } from "@/lib/phone";
import { isPhoneBlocked } from "@/lib/services/customers";

/**
 * Opt-in abandoned checkout leads. Privacy: only a normalized phone, an optional
 * name, variant ids/quantities (never prices), the source path and timestamps.
 * A blocked phone is never recorded. Open leads older than RETENTION_DAYS are
 * purged opportunistically on every write and every list.
 */
export const LEAD_RETENTION_DAYS = 30;
const DEDUPE_WINDOW_MS = 24 * 3_600_000;
const MAX_ITEMS = 10;

export type LeadStatus = "open" | "contacted" | "converted" | "dismissed";
export interface LeadItem { variantId: string; qty: number }
export interface CheckoutLead {
  id: string; phone: string; name: string; items: Array<LeadItem & { label: string }>;
  sourcePath: string | null; status: LeadStatus; createdAt: string; updatedAt: string;
}

export class LeadError extends Error {
  status: 400 | 404;
  constructor(status: 400 | 404, message: string) {
    super(message);
    this.name = "LeadError";
    this.status = status;
  }
}

interface Row {
  id: string; phone: string; name: string; items_json: string; source_path: string | null;
  status: LeadStatus; created_at: string; updated_at: string;
}

/** Deletes leads that were never worked (open/contacted) once they are too old. */
export function purgeOldLeads(now = Date.now()): number {
  const cutoff = new Date(now - LEAD_RETENTION_DAYS * 86_400_000).toISOString();
  return getDb().prepare(`DELETE FROM checkout_leads WHERE status IN ('open','contacted') AND created_at < ?`)
    .run(cutoff).changes;
}

function cleanItems(raw: unknown): LeadItem[] {
  if (!Array.isArray(raw)) return [];
  const db = getDb();
  const check = db.prepare(`SELECT 1 FROM variants v JOIN products p ON p.id = v.product_id
    WHERE v.id = ? AND v.active = 1 AND p.active = 1`);
  const merged = new Map<string, number>();
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    const e = entry as { variantId?: unknown; qty?: unknown } | null;
    if (!e || typeof e.variantId !== "string" || e.variantId.length > 64) continue;
    if (typeof e.qty !== "number" || !Number.isInteger(e.qty) || e.qty < 1 || e.qty > MAX_ITEMS) continue;
    if (!check.get(e.variantId)) continue;
    merged.set(e.variantId, Math.min(MAX_ITEMS, (merged.get(e.variantId) ?? 0) + e.qty));
  }
  return [...merged].map(([variantId, qty]) => ({ variantId, qty }));
}

/**
 * Upserts one open lead per phone within 24 h. Returns false (silently) when
 * the phone is invalid or blocked or no item is valid; callers never leak that.
 */
export function recordLead(input: { phone: string; name?: unknown; items: unknown; sourcePath?: unknown }, now = Date.now()): boolean {
  const phone = normalizeMaPhone(input.phone);
  if (!phone || isPhoneBlocked(phone)) return false;
  const items = cleanItems(input.items);
  if (items.length === 0) return false;
  const rawName = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const name = rawName || "Sans nom";
  const path = typeof input.sourcePath === "string" && /^\/[\w\-./]{0,118}$/.test(input.sourcePath) ? input.sourcePath : null;
  const db = getDb();
  const at = new Date(now).toISOString();
  const since = new Date(now - DEDUPE_WINDOW_MS).toISOString();
  db.transaction(() => {
    purgeOldLeads(now);
    const existing = db.prepare(`SELECT id FROM checkout_leads WHERE phone = ? AND status = 'open' AND created_at >= ?
      ORDER BY created_at DESC LIMIT 1`).get(phone, since) as { id: string } | undefined;
    if (existing) {
      db.prepare(`UPDATE checkout_leads SET name = ?, items_json = ?, source_path = ?, updated_at = ? WHERE id = ?`)
        .run(name, JSON.stringify(items), path, at, existing.id);
    } else {
      db.prepare(`INSERT INTO checkout_leads (id, phone, name, items_json, source_path, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`).run(nanoid(), phone, name, JSON.stringify(items), path, at, at);
    }
  })();
  return true;
}

function labelFor(variantId: string): string {
  const row = getDb().prepare(`SELECT p.name AS pname, v.sku FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`)
    .get(variantId) as { pname: string; sku: string } | undefined;
  return row ? `${row.pname} (${row.sku})` : "Article supprimé";
}

function map(row: Row): CheckoutLead {
  let items: LeadItem[] = [];
  try { items = JSON.parse(row.items_json) as LeadItem[]; } catch { /* corrupt row: show no items */ }
  return {
    id: row.id, phone: row.phone, name: row.name,
    items: items.map((i) => ({ ...i, label: labelFor(i.variantId) })),
    sourcePath: row.source_path, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

/** Open and contacted leads, newest first. Runs the retention purge first. */
export function listOpenLeads(now = Date.now()): CheckoutLead[] {
  purgeOldLeads(now);
  return (getDb().prepare(`SELECT id, phone, name, items_json, source_path, status, created_at, updated_at
    FROM checkout_leads WHERE status IN ('open','contacted') ORDER BY updated_at DESC LIMIT 200`).all() as Row[]).map(map);
}

export function getLead(id: string): CheckoutLead | null {
  const row = getDb().prepare(`SELECT id, phone, name, items_json, source_path, status, created_at, updated_at
    FROM checkout_leads WHERE id = ?`).get(id) as Row | undefined;
  return row ? map(row) : null;
}

/** Marks every open/contacted lead of this phone converted. Best-effort caller. */
export function markLeadsConverted(rawPhone: string, orderId: string, now = Date.now()): number {
  const phone = normalizeMaPhone(rawPhone);
  if (!phone) return 0;
  return getDb().prepare(`UPDATE checkout_leads SET status = 'converted', converted_order_id = ?, updated_at = ?
    WHERE phone = ? AND status IN ('open','contacted')`).run(orderId, new Date(now).toISOString(), phone).changes;
}

function setStatus(id: string, status: "contacted" | "dismissed", from: LeadStatus[]): void {
  const placeholders = from.map(() => "?").join(",");
  const result = getDb().prepare(`UPDATE checkout_leads SET status = ?, updated_at = ? WHERE id = ? AND status IN (${placeholders})`)
    .run(status, new Date().toISOString(), id, ...from);
  if (result.changes === 0) {
    if (!getLead(id)) throw new LeadError(404, "Panier introuvable.");
    throw new LeadError(400, "Ce panier a déjà été traité.");
  }
}

export function dismissLead(id: string): void { setStatus(id, "dismissed", ["open", "contacted"]); }
export function markLeadContacted(id: string): void { setStatus(id, "contacted", ["open", "contacted"]); }
