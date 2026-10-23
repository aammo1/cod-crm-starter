import { NextResponse } from "next/server";
import { revalidateStorefront } from "@/lib/storefront/revalidate";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { stockOpeningSchema } from "@/lib/services/inventory-schemas";
import { InventoryConflictError, InventoryValidationError, openStockItems } from "@/lib/services/inventory";
import { readLimitedJsonOrNull, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 128 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireAdmin();
    const parsed = stockOpeningSchema.safeParse(await readLimitedJsonOrNull(request, MAX_BODY_BYTES));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
    }
    const items = "items" in parsed.data ? parsed.data.items : [parsed.data];
    const summary = openStockItems(items, user.id);
    revalidateStorefront();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof InventoryConflictError || error instanceof InventoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: error instanceof InventoryConflictError ? 409 : 400 });
    }
    throw error;
  }
}
