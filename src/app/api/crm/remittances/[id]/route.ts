import { NextResponse } from "next/server";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { deleteRemittance, getRemittance, getUnpaidAging, RemittanceError } from "@/lib/services/cod-remittances";
import { log } from "@/lib/log";

export const runtime = "nodejs";

function fail(error: unknown): NextResponse {
  if (error instanceof AuthGuardError) return error.toResponse();
  if (error instanceof RemittanceError) return NextResponse.json({ error: error.message }, { status: error.status });
  log.error("remittance route failed", { error });
  return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireAdmin();
    const { id } = await params;
    return NextResponse.json(getRemittance(id));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireAdmin();
    const { id } = await params;
    const result = deleteRemittance(id);
    return NextResponse.json({ ok: true, ...result, aging: getUnpaidAging() });
  } catch (error) {
    return fail(error);
  }
}
