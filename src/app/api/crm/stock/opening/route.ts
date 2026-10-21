import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { stockOpeningSchema } from "@/lib/api-schemas";
import { getDb } from "@/lib/db";
import { DEFAULT_LOCATION, openStock } from "@/lib/services/inventory";

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

    const parsed = stockOpeningSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }

    const items = "items" in parsed.data ? parsed.data.items : [parsed.data];
    const actor = user.name ?? user.email ?? user.id;
    const db = getDb();

    // Validate variants first so a bad id is a clean 400, not a foreign-key
    // crash mid-transaction.
    for (const item of items) {
      const exists = db
        .prepare("SELECT 1 FROM variants WHERE id = ?")
        .get(item.variantId);
      if (!exists) {
        return NextResponse.json(
          { error: `Variante introuvable : ${item.variantId}` },
          { status: 400 },
        );
      }
    }

    // Single transaction for the whole batch: openStock's own transaction
    // becomes a savepoint, so a failure rolls the batch back atomically.
    const summary = db
      .transaction(() => {
        let created = 0;
        let skipped = 0;
        for (const item of items) {
          const ref = `open:${item.variantId}:${DEFAULT_LOCATION}`;
          const existing = db
            .prepare("SELECT qty FROM stock_movements WHERE ref = ?")
            .get(ref);
          if (existing) {
            skipped += 1; // Already opened (idempotency guard by ref).
            continue;
          }
          openStock(item.variantId, item.qty, actor);
          created += 1;
        }
        return { created, skipped };
      })
      .immediate();

    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}
