import { NextResponse } from "next/server";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { AdSpendError, adSpendTotals, listAdSpend, upsertAdSpend } from "@/lib/services/ad-spend";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 16 * 1024;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const entries = listAdSpend({ from, to });
    const totals = adSpendTotals({ from, to, groupBy: "channel" });
    return NextResponse.json({ entries, totals });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof AdSpendError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireAdmin();
    let body: unknown;
    try {
      body = await readLimitedJson(request, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const entry = upsertAdSpend(body, actor.id);
    return NextResponse.json({ entry }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof AdSpendError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}
