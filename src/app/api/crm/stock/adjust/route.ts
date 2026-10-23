import { NextResponse } from "next/server";
import { revalidateStorefront } from "@/lib/storefront/revalidate";
import { nanoid } from "nanoid";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { stockAdjustSchema } from "@/lib/services/inventory-schemas";
import { InventoryConflictError, InventoryValidationError, adjustStock } from "@/lib/services/inventory";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 128 * 1024;

export async function POST(
  request: Request,
): Promise<NextResponse> {
  try {
    const user = await requireAdmin();

    let body: unknown;
    try {
      body = await readLimitedJson(request, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
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
      if (error instanceof InventoryValidationError) {
        // Service-side validation (physical under reserved/quarantine, etc.).
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    revalidateStorefront();
    return NextResponse.json({ ok: true, ref });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}
