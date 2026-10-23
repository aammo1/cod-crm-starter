import { NextResponse } from "next/server";
import { storefrontRequestKeySchema, storefrontUpsellSchema } from "@/lib/storefront-api-schemas";
import { storefrontOrderApiError, storefrontOrderService } from "@/lib/storefront-order-api";
import { guardStoreRequest, readOrderCookie, storeError } from "@/lib/storefront/browser-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await guardStoreRequest(request, "store-upsell", 2048);
    if (!guard.ok) return guard.response;
    const { id } = await params;
    const cookie = readOrderCookie(request);
    if (!cookie || cookie.orderId !== id) return storeError("ORDER_TOKEN_REQUIRED", "Session de commande requise.", 403);
    const raw = guard.body as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return storeError("INVALID_REQUEST", "Demande d’offre invalide.", 400);
    const { requestKey, ...rest } = raw;
    const key = storefrontRequestKeySchema.safeParse(requestKey);
    if (!key.success) return storeError("INVALID_REQUEST_KEY", "Clé d’idempotence invalide.", 400);
    const body = storefrontUpsellSchema.safeParse(rest);
    if (!body.success) return storeError("INVALID_REQUEST", "Demande d’offre invalide.", 400);
    const response = storefrontOrderService().resolveUpsell(id, key.data, cookie.token, body.data);
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return storefrontOrderApiError(error);
  }
}
