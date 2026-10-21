import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { BlError, resumeBlOperation } from "@/lib/services/delivery-notes";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json(await resumeBlOperation(id, user));
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof BlError) return NextResponse.json({
      error: error.message, stage: error.stage, operationId: error.operationId,
    }, { status: error.status });
    throw error;
  }
}
