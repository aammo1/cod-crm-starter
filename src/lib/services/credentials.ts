import { getDb } from "@/lib/db";
import { verifyPasswordAsync } from "@/lib/password";
import { budgetKey, consumeBudgets, trustedClientIp } from "@/lib/services/security-budgets";
import type { Role } from "@/auth.config";

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
    const retry = consumeBudgets([
      { key: "login:global", limit: 60, windowMs: 60_000 },
      { key: budgetKey("login:account", email), limit: 10, windowMs: 900_000 },
      ...(ip ? [{ key: budgetKey("login:ip", ip), limit: 30, windowMs: 900_000 }] : []),
    ]);
    if (retry) return null;
    const row = getDb().prepare(`SELECT id, email, name, role, password_hash, is_active, session_version
      FROM users WHERE email = ?`).get(email) as {
      id: string; email: string; name: string; role: string; password_hash: string;
      is_active: number; session_version: number;
    } | undefined;
    if (!row || !row.is_active || (row.role !== "admin" && row.role !== "agent") ||
        !await verifyPasswordAsync(password, row.password_hash)) return null;
    return { id: row.id, name: row.name, email: row.email, role: row.role, sessionVersion: Number(row.session_version) };
  } catch {
    // Includes budget-store failures: never fail open or expose database errors.
    return null;
  }
}
