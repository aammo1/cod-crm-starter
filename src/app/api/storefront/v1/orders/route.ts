import { NextResponse } from "next/server";
import { requireStorefrontApi, readStorefrontJson, storefrontError } from "@/lib/storefront-auth";
import { storefrontCheckoutSchema, storefrontRequestKeySchema } from "@/lib/storefront-api-schemas";
import { storefrontOrderApiError, storefrontOrderService } from "@/lib/storefront-order-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const auth = requireStorefrontApi(request);
    if (!auth.ok) return auth.response;
    const key = storefrontRequestKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!key.success) return storefrontError("INVALID_REQUEST_KEY", "Clé d’idempotence invalide.", 400);
    const json = await readStorefrontJson(request);
    if (!json.ok) return json.response;
    const body = storefrontCheckoutSchema.safeParse(json.body);
    if (!body.success) return storefrontError("INVALID_REQUEST", "Demande de commande invalide.", 400);
    const result = storefrontOrderService().checkout(key.data, body.data);
    return NextResponse.json(result.response, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return storefrontOrderApiError(error);
  }
}
