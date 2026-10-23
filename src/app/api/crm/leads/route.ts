import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { listOpenLeads } from "@/lib/services/checkout-leads";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    await requireUser();
    return NextResponse.json({ leads: listOpenLeads() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}
