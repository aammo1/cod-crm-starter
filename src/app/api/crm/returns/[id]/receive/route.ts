import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { getReturn, markReturnReceived } from "@/lib/services/returns";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { id } = await params;

    const current = getReturn(id);
    if (!current) {
      return NextResponse.json({ error: "Retour introuvable." }, { status: 404 });
    }
    if (current.status === "inspected") {
      return NextResponse.json(
        { error: "Retour déjà inspecté." },
        { status: 409 },
      );
    }
    if (current.status === "received") {
      return NextResponse.json(
        { error: "Colis déjà reçu — en attente d'inspection." },
        { status: 409 },
      );
    }

    const actor = user.name ?? user.email ?? user.id;
    const updated = markReturnReceived(id, actor);
    if (!updated || updated.status === "returning") {
      // Lost a concurrent receive — report the state that actually won.
      const latest = getReturn(id);
      const message =
        latest?.status === "inspected"
          ? "Retour déjà inspecté."
          : "Colis déjà reçu — en attente d'inspection.";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      return: {
        id: updated.id,
        status: updated.status,
        receivedAt: updated.receivedAt,
      },
    });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}
