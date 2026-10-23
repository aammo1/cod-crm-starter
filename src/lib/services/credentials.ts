import { getDb } from "@/lib/db";
import { hashPassword, verifyPasswordStatus } from "@/lib/password";
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
    // Account/IP buckets count FAILURES only, so correct logins never burn them
    // and a successful login clears its account buckets. With a trusted IP the
    // strict lockout is per email+IP so one client cannot lock an admin out for
    // everyone; without an IP the strict per-email bucket is the documented trade-off.
    const failureBudgets = ip ? [
      { key: budgetKey("login:account-ip", `${email}\n${ip}`), limit: 10, windowMs: 900_000 },
      { key: budgetKey("login:account", email), limit: 50, windowMs: 900_000 },
      { key: budgetKey("login:ip", ip), limit: 30, windowMs: 900_000 },
    ] : [
      { key: budgetKey("login:account", email), limit: 10, windowMs: 900_000 },
    ];
    if (peekBudgets(failureBudgets)) return null;
    const row = getDb().prepare(`SELECT id, email, name, role, password_hash, is_active, session_version
      FROM users WHERE email = ?`).get(email) as {
      id: string; email: string; name: string; role: string; password_hash: string;
      is_active: number; session_version: number;
    } | undefined;
    // Hash-work cap: counted only for attempts that reach scrypt.
    if (consumeBudgets([{ key: "login:global", limit: 600, windowMs: 60_000 }])) return null;
    // Unknown accounts still pay one scrypt so timing does not reveal which emails exist.
    const check = await verifyPasswordStatus(password, row?.password_hash ?? dummyHash());
    // Saturation says nothing about the password: never count it as a failure.
    if (check === "busy") return null;
    const passwordOk = check === "ok";
    if (!row || !row.is_active || (row.role !== "admin" && row.role !== "agent") || !passwordOk) {
      consumeBudgets(failureBudgets);
      return null;
    }
    clearBudgets(failureBudgets.slice(0, ip ? 2 : 1).map((b) => b.key));
    return { id: row.id, name: row.name, email: row.email, role: row.role, sessionVersion: Number(row.session_version) };
  } catch {
    // Includes budget-store failures: never fail open or expose database errors.
    return null;
  }
}
