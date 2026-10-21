import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { stockAdjustSchema } from "@/lib/api-schemas";
import { getDb } from "@/lib/db";
import { InventoryConflictError, adjustStock } from "@/lib/services/inventory";

export const runtime = "nodejs";

export async function POST(
  request: Request,
): Promise<NextResponse> {
  try {
    const user = await requireAdmin();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const parsed = stockAdjustSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }

    const { variantId, requestId, physicalDelta, quarantineDelta, reason } = parsed.data;
    const db = getDb();
    if (!db.prepare("SELECT 1 FROM variants WHERE id = ?").get(variantId)) {
      return NextResponse.json(
        { error: `Variante introuvable : ${variantId}` },
        { status: 400 },
      );
    }

    const actor = user.name ?? user.email ?? user.id;
    const ref = requestId ? `adj-request:${user.id}:${requestId}` : `adj-${variantId}-${Date.now()}-${nanoid(6)}`;
    try {
      adjustStock(
        variantId,
        { physicalDelta, quarantineDelta },
        reason,
        actor,
        ref,
      );
    } catch (error) {
      if (error instanceof InventoryConflictError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error instanceof Error) {
        // Service-side validation (physical under reserved/quarantine, etc.).
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, ref });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}
