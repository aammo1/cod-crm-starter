import { NextResponse } from "next/server";
import { requireStorefrontApi, storefrontError } from "@/lib/storefront-auth";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";
import { storefrontRequestKeySchema, storefrontUpsellSchema } from "@/lib/storefront-api-schemas";
import { storefrontOrderApiError, storefrontOrderService } from "@/lib/storefront-order-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireStorefrontApi(request);
    if (!auth.ok) return auth.response;
    const key = storefrontRequestKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!key.success) return storefrontError("INVALID_REQUEST_KEY", "Clé d’idempotence invalide.", 400);
    const token = request.headers.get("x-order-token");
    if (!token || token.length > 512) return storefrontError("INVALID_ORDER_TOKEN", "Jeton de commande invalide.", 401);
    const body = storefrontUpsellSchema.safeParse(await readLimitedJson(request, 2048));
    if (!body.success) return storefrontError("INVALID_REQUEST", "Demande d’offre invalide.", 400);
    const { id } = await params;
    const response = storefrontOrderService().resolveUpsell(id, key.data, token, body.data);
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RequestBodyError) return storefrontError(
      error.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", error.message, error.status,
    );
    return storefrontOrderApiError(error);
  }
}
