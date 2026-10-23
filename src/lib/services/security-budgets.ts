import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { getDb } from "@/lib/db";
import { normalizeMaPhone } from "@/lib/phone";

export type BudgetScope = "phone" | "ip" | "global" | "account";
export type Budget = { key: string; limit: number; windowMs: number; scope?: BudgetScope };
export type BudgetResult = { limited: false } | { limited: true; scope: BudgetScope | undefined; retryAfterSeconds: number };

export function budgetKey(scope: string, value: string): string {
  return `${scope}:${createHash("sha256").update(value).digest("hex")}`;
}

/** Opt in only when ingress overwrites this header and the app port is private. */
export function trustedClientIp(request: Request): string | null {
  const header = process.env.SECURITY_TRUSTED_IP_HEADER;
  if (header !== "x-real-ip" && header !== "x-forwarded-for") return null;
  // The nearest trusted proxy must overwrite x-real-ip or append to XFF.
  const raw = request.headers.get(header)?.split(",").at(-1)?.trim() ?? "";
  return isIP(raw) ? raw : null;
}

/** Shared across processes/restarts. Denied requests never extend the window. */
export function consumeBudgets(budgets: Budget[], now = Date.now()): number {
  const result = consumeBudgetsDetailed(budgets, now);
  return result.limited ? result.retryAfterSeconds : 0;
}

/** Same as consumeBudgets but reports which bucket (longest wait) tripped. */
export function consumeBudgetsDetailed(budgets: Budget[], now = Date.now()): BudgetResult {
  const db = getDb();
  return db.transaction((): BudgetResult => {
    db.prepare(`DELETE FROM security_budgets WHERE key IN
      (SELECT key FROM security_budgets WHERE expires_at <= ? LIMIT 1000)`).run(now);
    let retryMs = 0;
    let scope: BudgetScope | undefined;
    for (const budget of budgets) {
      const row = db.prepare("SELECT hits, expires_at FROM security_budgets WHERE key = ?")
        .get(budget.key) as { hits: number; expires_at: number } | undefined;
      if (row && row.expires_at > now && row.hits >= budget.limit && row.expires_at - now > retryMs) {
        retryMs = row.expires_at - now;
        scope = budget.scope;
      }
    }
    if (retryMs) return { limited: true, scope, retryAfterSeconds: Math.ceil(retryMs / 1000) };
    for (const budget of budgets) {
      db.prepare(`INSERT INTO security_budgets(key, hits, expires_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET
          hits = CASE WHEN expires_at <= ? THEN 1 ELSE hits + 1 END,
          expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END`)
        .run(budget.key, now + budget.windowMs, now, now);
    }
    return { limited: false };
  }).immediate();
}

/** Read-only check: Retry-After seconds if any budget is exhausted, else 0. */
export function peekBudgets(budgets: Budget[], now = Date.now()): number {
  const db = getDb();
  let retryMs = 0;
  for (const budget of budgets) {
    const row = db.prepare("SELECT hits, expires_at FROM security_budgets WHERE key = ?")
      .get(budget.key) as { hits: number; expires_at: number } | undefined;
    if (row && row.expires_at > now && row.hits >= budget.limit) {
      retryMs = Math.max(retryMs, row.expires_at - now);
    }
  }
  return retryMs ? Math.ceil(retryMs / 1000) : 0;
}

export function clearBudgets(keys: string[]): void {
  const del = getDb().prepare("DELETE FROM security_budgets WHERE key = ?");
  for (const key of keys) del.run(key);
}

/** Per-IP is primary when a trusted IP exists; the global bucket is then only a high-water safety net. */
export function publicRequestBudget(request: Request, scope: "checkout" | "pixel"): number {
  const ip = trustedClientIp(request);
  const base = scope === "checkout" ? 120 : 6000;
  return consumeBudgets([
    { key: `${scope}:global`, limit: ip && scope === "checkout" ? 600 : base, windowMs: 60_000 },
    ...(ip ? [{ key: budgetKey(`${scope}:ip`, ip), limit: scope === "checkout" ? 20 : 300, windowMs: 60_000 }] : []),
  ]);
}

/** All authenticated v1 requests, including durable receipt replays. */
export function storefrontRequestBudget(request: Request): number {
  const ip = trustedClientIp(request);
  return consumeBudgets([
    { key: "storefront:v1:global", limit: 600, windowMs: 60_000 },
    ...(ip ? [{ key: budgetKey("storefront:v1:ip", ip), limit: 120, windowMs: 60_000 }] : []),
  ]);
}

/**
 * Task 11: call ONLY for a validated new order, inside its immediate transaction,
 * AFTER durable receipt lookup. Never call on replay or upsell resolution.
 * Returns Retry-After seconds (0 = allowed); the caller must stop on denial.
 * Nested SQLite transactions let the hit roll back if order persistence fails.
 */
export function consumeStorefrontNewOrderPhoneBudget(phone: string, now = Date.now()): number {
  const normalized = normalizeMaPhone(phone);
  if (!normalized) throw new Error("Numéro de téléphone marocain invalide.");
  const result = consumeBudgetsDetailed([
    { key: budgetKey("checkout:phone", normalized), limit: 5, windowMs: 600_000, scope: "phone" },
  ], now);
  return result.limited ? result.retryAfterSeconds : 0;
}
