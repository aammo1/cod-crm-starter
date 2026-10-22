import { getDb } from "@/lib/db";
import { hashPassword, verifyPasswordAsync } from "@/lib/password";
import { budgetKey, clearBudgets, consumeBudgets, peekBudgets, trustedClientIp } from "@/lib/services/security-budgets";
import type { Role } from "@/auth.config";

let cachedDummyHash: string | null = null;
function dummyHash(): string {
  return (cachedDummyHash ??= hashPassword(`dummy-${Math.random()}`));
}

/** Shared by the Auth.js credentials endpoint and the login Server Action. */
export async function authenticateCredentials(
  credentials: Partial<Record<"email" | "password", unknown>>,
  request: Request,
): Promise<{ id: string; name: string; email: string; role: Role; sessionVersion: number } | null> {
  const email = typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : "";
  const password = typeof credentials.password === "string" ? credentials.password : "";
  if (!email || email.length > 254 || !password || password.length > 128) return null;
  try {
    const ip = trustedClientIp(request);
    // Attempt cap only bounds hash work; it is high so a flood cannot lock the team out.
    if (consumeBudgets([{ key: "login:global", limit: 300, windowMs: 60_000 }])) return null;
    // Account/IP buckets count FAILURES only, so correct logins never burn them
    // and a successful login clears its account bucket.
    const failureBudgets = [
      { key: budgetKey("login:account", email), limit: 10, windowMs: 900_000 },
      ...(ip ? [{ key: budgetKey("login:ip", ip), limit: 30, windowMs: 900_000 }] : []),
    ];
    if (peekBudgets(failureBudgets)) return null;
    const row = getDb().prepare(`SELECT id, email, name, role, password_hash, is_active, session_version
      FROM users WHERE email = ?`).get(email) as {
      id: string; email: string; name: string; role: string; password_hash: string;
      is_active: number; session_version: number;
    } | undefined;
    // Unknown accounts still pay one scrypt so timing does not reveal which emails exist.
    const passwordOk = await verifyPasswordAsync(password, row?.password_hash ?? dummyHash());
    if (!row || !row.is_active || (row.role !== "admin" && row.role !== "agent") || !passwordOk) {
      consumeBudgets(failureBudgets);
      return null;
    }
    clearBudgets([failureBudgets[0].key]);
    return { id: row.id, name: row.name, email: row.email, role: row.role, sessionVersion: Number(row.session_version) };
  } catch {
    // Includes budget-store failures: never fail open or expose database errors.
    return null;
  }
}
