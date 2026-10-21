import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { orderLineUpdateSchema } from "@/lib/api-schemas";
import { ConfirmationError, updateOrderLine } from "@/lib/services/confirmation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const parsed = orderLineUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }

    const item = updateOrderLine(id, parsed.data, user);
    return NextResponse.json({
      ok: true,
      item: { lineIndex: parsed.data.lineIndex, color: item.color, size: item.size },
    });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof ConfirmationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}