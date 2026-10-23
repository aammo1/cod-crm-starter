import { NextResponse } from "next/server";
import { revalidateStorefront } from "@/lib/storefront/revalidate";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { stockBatchSchema } from "@/lib/services/inventory-schemas";
import { applyStockBatch, InventoryConflictError, InventoryValidationError } from "@/lib/services/inventory";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireAdmin();
    const body: unknown = await request.json().catch(() => null);
    const parsed = stockBatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Requête de stock invalide : vérifiez les quantités, le motif et le stock attendu." }, { status: 400 });
    }
    const result = applyStockBatch(parsed.data, user.id);
    revalidateStorefront();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof InventoryConflictError || error instanceof InventoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: error instanceof InventoryConflictError ? 409 : 400 });
    }
    throw error;
  }
}
