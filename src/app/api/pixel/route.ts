import { NextResponse } from "next/server";
import { z } from "@/lib/validation";
import { metaContextSchema } from "@/lib/meta-shared";
import { enqueueMeta, metaEnabled, requestMetaContext } from "@/lib/services/meta";
import { listStorefront } from "@/lib/services/catalog";
import { shippingFor } from "@/lib/pricing";
import { getStoreSettings } from "@/lib/services/store-settings";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";
import { publicRequestBudget } from "@/lib/services/security-budgets";

export const runtime = "nodejs";
const schema = metaContextSchema.extend({
  name: z.enum(["PageView", "ViewContent", "AddToCart", "InitiateCheckout"]),
  params: z.object({
    content_ids: z.array(z.string().min(1).max(128)).max(100).optional(),
    contents: z.array(z.object({ id: z.string().min(1).max(128), quantity: z.number().int().min(1).max(100) })).max(100).optional(),
  }),
});

export async function POST(request: Request) {
  if (!metaEnabled()) return new NextResponse(null, { status: 204 });
  if (request.headers.get("sec-fetch-site") === "cross-site") return new NextResponse(null, { status: 403 });
  // Only public upper-funnel ingestion is budgeted. Durable Purchase delivery
  // and retries never pass through this limiter.
  const retry = publicRequestBudget(request, "pixel");
  if (retry) return new NextResponse(null, { status: 429, headers: { "Retry-After": String(retry) } });
  let raw: unknown;
  try { raw = await readLimitedJson(request, 16_384); }
  catch (error) { return new NextResponse(null, { status: error instanceof RequestBodyError ? error.status : 400 }); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const context = requestMetaContext(request, parsed.data);
  if (!context) return new NextResponse(null, { status: 403 });
  const { name, params } = parsed.data;
  // Never relay client-supplied prices to Meta, even for upper-funnel events.
  let custom: object = {};
  if (name !== "PageView") {
    const products = new Map(listStorefront().map((product) => [product.id, product]));
    const requested = params.contents ?? params.content_ids?.map((id) => ({ id, quantity: 1 })) ?? [];
    if (!requested.length || requested.some((item) => !products.has(item.id))) return new NextResponse(null, { status: 400 });
    const contents = requested.map((item) => ({ ...item, item_price: products.get(item.id)!.price }));
    const subtotal = contents.reduce((sum, item) => sum + item.item_price * item.quantity, 0);
    custom = {
      content_ids: [...new Set(contents.map((item) => item.id))], contents,
      ...(name === "ViewContent" ? { content_name: products.get(contents[0].id)!.name } : {}),
      content_type: "product", currency: "MAD", value: subtotal + (name === "InitiateCheckout" ? shippingFor(subtotal, getStoreSettings()) : 0),
      num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
    };
  }
  enqueueMeta(name, context, custom);
  return NextResponse.json({ queued: true });
}
