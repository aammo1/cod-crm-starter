import { NextResponse } from "next/server";
import { revalidateStorefront } from "@/lib/storefront/revalidate";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { editOrder, OrderEditError } from "@/lib/services/order-edits";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
    const state = editOrder(id, body, user);
    revalidateStorefront();
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof OrderEditError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
