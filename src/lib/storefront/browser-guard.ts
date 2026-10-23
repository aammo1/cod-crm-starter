import "server-only";
import { browserMutationAllowed } from "@/lib/browser-mutation";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";
import { budgetKey, consumeBudgets, trustedClientIp } from "@/lib/services/security-budgets";

export function storeError(code: string, message: string, status: number, retryAfter?: number): Response {
  return Response.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) },
  });
}

/** Same-origin check, shared durable budget and bounded JSON body for /api/store/* POSTs. */
export async function guardStoreRequest(
  request: Request, budgetScope: "store-checkout" | "store-upsell", maxBytes = 16_384,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const site = request.headers.get("sec-fetch-site");
  const sameOrigin = site ? site === "same-origin" : browserMutationAllowed(request);
  if (!sameOrigin) return { ok: false, response: storeError("FORBIDDEN", "Origine non autorisée.", 403) };
  try {
    const ip = trustedClientIp(request);
    const limit = budgetScope === "store-checkout" ? 120 : 240;
    const retry = consumeBudgets([
      { key: `${budgetScope}:global`, limit, windowMs: 60_000 },
      ...(ip ? [{ key: budgetKey(`${budgetScope}:ip`, ip), limit: limit / 6, windowMs: 60_000 }] : []),
    ]);
    if (retry) return { ok: false, response: storeError("RATE_LIMITED", "Réessayez dans quelques instants.", 429, retry) };
    return { ok: true, body: await readLimitedJson(request, maxBytes) };
  } catch (error) {
    if (error instanceof RequestBodyError) return { ok: false, response: storeError(
      error.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", error.message, error.status) };
    return { ok: false, response: storeError("SERVICE_UNAVAILABLE", "Service momentanément indisponible. Réessayez.", 503, 1) };
  }
}

export const ORDER_COOKIE = "store_order";

export function orderCookie(request: Request, orderId: string, token: string): string {
  const https = new URL(request.url).protocol === "https:" || (process.env.CRM_PUBLIC_URL ?? "").startsWith("https:") ||
    request.headers.get("x-forwarded-proto") === "https";
  return `${ORDER_COOKIE}=${orderId}.${token}; HttpOnly; ${https ? "Secure; " : ""}SameSite=Strict; Path=/api/store; Max-Age=3600`;
}

export function readOrderCookie(request: Request): { orderId: string; token: string } | null {
  const raw = (request.headers.get("cookie") ?? "").split(";").map((c) => c.trim())
    .find((c) => c.startsWith(`${ORDER_COOKIE}=`))?.slice(ORDER_COOKIE.length + 1);
  const dot = raw?.indexOf(".") ?? -1;
  if (!raw || dot < 1 || raw.length > 600) return null;
  return { orderId: raw.slice(0, dot), token: raw.slice(dot + 1) };
}
