import { NextResponse } from "next/server";
import { getCrossSells } from "@/lib/storefront/data";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("exclude") ?? "").split(",")
    .map((id) => id.trim()).filter((id) => id && id.length <= 200).slice(0, 20);
  const products = await getCrossSells([...new Set(ids)].sort().join(","), 4);
  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id, slug: p.slug, name: p.name, price: p.price, image: p.images[0] ?? "",
      variantId: p.variants.find((v) => v.available)?.id ?? null, packs: p.packs,
    })),
  }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
