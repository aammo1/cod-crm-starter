import { NextResponse } from "next/server";
import { resolveUpsell, UpsellConflictError } from "@/lib/db";
import { upsellActionSchema } from "@/lib/api-schemas";
import { purchaseFor } from "@/lib/services/meta";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await readLimitedJson(request, 2048);
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const parsed = upsellActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
      { status: 400 }
    );
  }

  try {
    const row = resolveUpsell(id, parsed.data.action);
    if (!row) {
      return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      status: row.upsellStatus,
      purchase: purchaseFor(row.id),
      order: { id: row.id, total: row.total },
    });
  } catch (error) {
    if (error instanceof UpsellConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
