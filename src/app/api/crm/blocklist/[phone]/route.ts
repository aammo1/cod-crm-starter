import { NextResponse } from "next/server";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { BlocklistError, unblockPhone } from "@/lib/services/customers";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ phone: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
    const { phone } = await params;
    let decoded = phone;
    try {
      decoded = decodeURIComponent(phone);
    } catch {
      return NextResponse.json({ error: "Numéro invalide." }, { status: 400 });
    }
    try {
      if (!unblockPhone(decoded)) {
        return NextResponse.json({ error: "Numéro introuvable dans la liste." }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof BlocklistError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}
