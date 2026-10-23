import { NextResponse } from "next/server";
import { revalidateStorefront } from "@/lib/storefront/revalidate";
import { ZodError } from "zod";

import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { createProduct } from "@/lib/services/catalog";
import { createProductSchema } from "@/lib/services/catalog-schemas";
import { InventoryConflictError, InventoryValidationError } from "@/lib/services/inventory-errors";
import { validateVariantCombinations } from "@/lib/variant-options";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireAdmin();

    const body: unknown = await request.json().catch(() => null);
    const parsed = createProductSchema.parse(body);
    if (parsed.variants) {
      try {
        let generatedPrefix = "AUTO";
        while (parsed.variants.some(variant => variant.sku?.startsWith(generatedPrefix))) generatedPrefix += "X";
        validateVariantCombinations(parsed.variants.map((variant, index) => ({
          ...variant,
          id: variant.id ?? `new-${index}`,
          sku: variant.sku ?? `${generatedPrefix}-${index}`,
        })), parsed.optionDefinitions ?? []);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Variantes invalides." }, { status: 400 });
      }
    }
    const product = createProduct(parsed, { actor: user.id });
    revalidateStorefront();
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof InventoryConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Requête invalide." }, { status: 400 });
    }
    if (error instanceof InventoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
