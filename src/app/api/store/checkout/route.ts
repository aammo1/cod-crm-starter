import { NextResponse } from "next/server";
import { storefrontCheckoutSchema, storefrontRequestKeySchema, storefrontAttributionSchema } from "@/lib/storefront-api-schemas";
import { storefrontOrderApiError, storefrontOrderService } from "@/lib/storefront-order-api";
import { trustedClientIp } from "@/lib/services/security-budgets";
import { guardStoreRequest, orderCookie, storeError } from "@/lib/storefront/browser-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ATTRIBUTION_KEYS = ["eventId", "sourceUrl", "fbp", "fbc", "ttp", "ttclid"] as const;

/** Server-built meta: only allowlisted browser fields; IP/UA come from the request. */
function buildMeta(request: Request, attribution: unknown) {
  if (!attribution || typeof attribution !== "object") return undefined;
  const source = attribution as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of ATTRIBUTION_KEYS) if (source[key] !== undefined) picked[key] = source[key];
  const ip = trustedClientIp(request);
  const ua = request.headers.get("user-agent")?.slice(0, 1024);
  const parsed = storefrontAttributionSchema.safeParse({
    ...picked, ...(ip ? { clientIpAddress: ip } : {}), ...(ua ? { clientUserAgent: ua } : {}),
  });
  return parsed.success ? parsed.data : undefined;
}

export async function POST(request: Request) {
  try {
    const guard = await guardStoreRequest(request, "store-checkout");
    if (!guard.ok) return guard.response;
    const raw = guard.body as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return storeError("INVALID_REQUEST", "Demande de commande invalide.", 400);
    const key = storefrontRequestKeySchema.safeParse(raw.requestKey);
    if (!key.success) return storeError("INVALID_REQUEST_KEY", "Clé d’idempotence invalide.", 400);
    const meta = buildMeta(request, raw.attribution);
    const body = storefrontCheckoutSchema.safeParse({ customer: raw.customer, items: raw.items, ...(meta ? { meta } : {}) });
    if (!body.success) return storeError("INVALID_REQUEST", "Demande de commande invalide.", 400);
    const result = storefrontOrderService().checkout(key.data, body.data);
    const { orderToken, ...publicResponse } = result.response;
    const response = NextResponse.json(publicResponse, { status: result.status, headers: { "Cache-Control": "no-store" } });
    response.headers.append("Set-Cookie", orderCookie(request, publicResponse.orderId, orderToken));
    return response;
  } catch (error) {
    return storefrontOrderApiError(error);
  }
}
