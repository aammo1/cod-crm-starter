import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { HandoffError, handoffBl } from "@/lib/services/expeditions";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { id } = await params;

    // Per-order loop: one reservation consumption per order; a failing parcel
    // never blocks the others (failures reported individually).
    const { results } = handoffBl(id, user.email ?? user.id);
    return NextResponse.json({ ok: results.every((result) => result.ok), results });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof HandoffError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
