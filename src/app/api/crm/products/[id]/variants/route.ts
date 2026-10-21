import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { getProductById } from "@/lib/services/catalog";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireUser();
    const { id } = await params;

    const product = getProductById(id);
    if (!product) {
      return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      productActive: product.active,
      variants: product.variants
        .filter((variant) => product.active && variant.active)
        .map((variant) => ({
          variantId: variant.id,
          sku: variant.sku,
          label: variant.label,
          options: variant.options,
          available: variant.available,
        })),
    });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}
