import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";
import { storefrontRequestBudget } from "@/lib/services/security-budgets";

export function storefrontError(code: string, message: string, status: number, retryAfter?: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}),
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
}

export type StorefrontAuthorization = { ok: true } | { ok: false; response: NextResponse };

/**
 * Node route handlers only. Call before reading the body or looking up receipts.
 * This credential is deliberately unrelated to Auth.js roles/catalog-agent auth.
 * No Origin/CORS exception is granted to session-authenticated browser routes.
 */
export function requireStorefrontApi(request: Request): StorefrontAuthorization {
  const deny = (code: string, message: string, status: number, retryAfter?: number): StorefrontAuthorization =>
    ({ ok: false, response: storefrontError(code, message, status, retryAfter) });
  if (!new URL(request.url).pathname.startsWith("/api/storefront/v1/")) {
    return deny("FORBIDDEN", "Accès non autorisé.", 403);
  }
  // Read at request time, never at build/import time or from public env variables.
  const key = process.env.STOREFRONT_API_KEY;
  const tokenPattern = /^[A-Za-z0-9._~+\/-]+={0,2}$/;
  if (!key || key.length < 32 || !tokenPattern.test(key)) {
    return deny("STOREFRONT_DISABLED", "L’intégration boutique n’est pas disponible.", 503);
  }
  // Headers coalesces duplicates with a comma; the anchored grammar rejects them.
  const supplied = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~+\/-]+={0,2})$/i.exec(supplied);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const equal = timingSafeEqual(digest(match?.[1] ?? ""), digest(key));
  if (!match || !equal) {
    return deny("UNAUTHORIZED", "Identifiant boutique invalide.", 401);
  }
  // A storefront must call from its server. Never emit CORS permission headers.
  if (request.headers.has("origin") || request.headers.has("sec-fetch-site")) {
    return deny("BROWSER_ACCESS_FORBIDDEN", "Accès réservé au serveur de la boutique.", 403);
  }
  const retry = storefrontRequestBudget(request);
  if (retry) return deny("RATE_LIMITED", "Réessayez dans quelques instants.", 429, retry);
  return { ok: true };
}

/** Bounded streaming JSON with the same v1 error envelope; call after auth. */
export async function readStorefrontJson(request: Request): Promise<
  { ok: true; body: unknown } | { ok: false; response: NextResponse }
> {
  try {
    return { ok: true, body: await readLimitedJson(request, 32_768) };
  } catch (error) {
    if (!(error instanceof RequestBodyError)) throw error;
    return { ok: false, response: storefrontError(
      error.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", error.message, error.status,
    ) };
  }
}
