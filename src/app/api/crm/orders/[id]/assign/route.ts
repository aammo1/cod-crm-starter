import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { assignOrderSchema } from "@/lib/api-schemas";
import { assignOrder, getCrmOrder, isAgentEligible } from "@/lib/services/orders";

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

    const parsed = assignOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }

    if (!getCrmOrder(id)) {
      return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    }

    const targetId = parsed.data.agentId === "me" ? user.id : parsed.data.agentId;
    if (targetId !== user.id && user.role !== "admin") {
      return NextResponse.json(
        { error: "Vous ne pouvez vous assigner que vous-même." },
        { status: 403 },
      );
    }
    if (!isAgentEligible(targetId)) {
      return NextResponse.json({ error: "Agent introuvable ou inactif." }, { status: 404 });
    }

    const ok = assignOrder(id, targetId);
    if (!ok) {
      return NextResponse.json({ error: "Commande introuvable ou agent inéligible." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, assignedTo: targetId });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}
