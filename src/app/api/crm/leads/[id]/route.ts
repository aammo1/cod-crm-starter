import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";
import { dismissLead, LeadError, markLeadContacted } from "@/lib/services/checkout-leads";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 1024;

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireUser();
    let body: unknown;
    try {
      body = await readLimitedJson(request, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const action = (body as { action?: unknown } | null)?.action;
    if (action !== "dismiss" && action !== "contacted") {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }
    const { id } = await ctx.params;
    if (action === "dismiss") dismissLead(id); else markLeadContacted(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof LeadError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}
