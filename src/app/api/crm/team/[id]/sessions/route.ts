import { NextResponse } from "next/server";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { revokeSessions, TeamServiceError } from "@/lib/services/team";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    revokeSessions(id, actor.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof TeamServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}
