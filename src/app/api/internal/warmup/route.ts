import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidateStorefront } from "@/lib/storefront/revalidate";
import { warmupToken } from "@/lib/storefront/warmup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => new NextResponse(null, { status: 404 });

export async function POST(request: Request) {
  const expected = warmupToken();
  const given = request.headers.get("x-warmup-token");
  if (!expected || !given) return notFound();
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return notFound();
  revalidateStorefront();
  return new NextResponse(null, { status: 204 });
}
