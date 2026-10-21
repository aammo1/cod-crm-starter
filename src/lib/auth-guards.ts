import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth, type Role } from "@/auth";
import { getAccountSessionState } from "@/lib/services/team";

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
  sessionVersion?: number;
}

/**
 * Route-protection convention:
 * - Pages under /admin and /crm are covered by middleware (src/middleware.ts),
 *   which redirects unauthenticated visitors to /login.
 * - Pages must also call requireUser()/requireAdmin() — on failure they
 *   redirect (/login for 401, /crm for 403) instead of rendering.
 * - Every /api/admin/* and /api/crm/* route handler MUST call
 *   requireUser()/requireAdmin() at the top of the handler (middleware only
 *   enforces the browser mutation origin boundary for APIs) and map a thrown AuthGuardError to its JSON
 *   response:
 *
 *     try {
 *       const user = await requireAdmin();
 *       ...
 *     } catch (error) {
 *       if (error instanceof AuthGuardError) return error.toResponse();
 *       throw error;
 *     }
 *
 *   Agents never see financial aggregates or stock adjustments; admin-only
 *   routes use requireAdmin(). Seeing a single order's COD amount is allowed
 *   for agents (needed to confirm orders).
 */
export class AuthGuardError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthGuardError";
  }

  toResponse(): NextResponse {
    return NextResponse.json({ error: this.message }, { status: this.status });
  }
}

// Page renders (RSC flights, document requests, server actions) get a
// redirect on failure; route handlers get a JSON error instead.
async function isPageRender(): Promise<boolean> {
  const h = await headers();
  if (h.get("rsc") === "1") return true;
  const accept = h.get("accept") ?? "";
  return accept.includes("text/html") || accept.includes("text/x-component");
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const tokenSessionVersion = session.user.sessionVersion;
  if (typeof tokenSessionVersion !== "number") return null;

  const dbState = getAccountSessionState(session.user.id);
  if (!dbState || !dbState.isActive) return null;
  if (dbState.sessionVersion !== tokenSessionVersion) return null;

  return {
    id: dbState.id,
    name: dbState.name,
    email: dbState.email,
    role: dbState.role,
    sessionVersion: dbState.sessionVersion,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    if (await isPageRender()) redirect("/login");
    throw new AuthGuardError(401, "Authentification requise.");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    if (await isPageRender()) redirect("/crm");
    throw new AuthGuardError(403, "Accès réservé aux administrateurs.");
  }
  return user;
}
