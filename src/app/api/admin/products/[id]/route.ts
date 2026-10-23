import { NextResponse } from "next/server";
import { revalidateStorefront } from "@/lib/storefront/revalidate";
import { ZodError } from "zod";

import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { updateProduct } from "@/lib/services/catalog";
import { updateProductSchema } from "@/lib/services/catalog-schemas";
import { InventoryConflictError } from "@/lib/services/inventory-errors";
import { readLimitedJsonOrNull, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 256 * 1024;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();

    const { id } = await params;
    const body: unknown = await readLimitedJsonOrNull(request, MAX_BODY_BYTES);
    const parsed = updateProductSchema.parse(body);
    const product = updateProduct(id, parsed);
    revalidateStorefront();
    return NextResponse.json({ product }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Requête invalide." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Produit introuvable.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InventoryConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
