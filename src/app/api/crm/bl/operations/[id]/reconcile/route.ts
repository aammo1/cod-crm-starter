import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { reconcileBlSchema } from "@/lib/api-schemas";
import { BlError, reconcileBlOperation } from "@/lib/services/delivery-notes";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body: unknown = await request.json().catch(() => null);
    const parsed = reconcileBlSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({
      error: parsed.error.issues[0]?.message ?? "Requête invalide.",
    }, { status: 400 });
    return NextResponse.json(reconcileBlOperation(id, parsed.data, user));
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof BlError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
