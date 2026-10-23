import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { revokeSessions } from "@/lib/services/team";

export const runtime = "nodejs";

export async function DELETE(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    revokeSessions(user.id, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}
