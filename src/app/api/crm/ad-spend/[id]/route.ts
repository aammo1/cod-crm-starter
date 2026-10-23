import { NextResponse } from "next/server";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { AdSpendError, deleteAdSpend } from "@/lib/services/ad-spend";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
    const { id } = await params;
    deleteAdSpend(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof AdSpendError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}
