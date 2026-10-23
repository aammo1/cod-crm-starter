import { NextResponse } from "next/server";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { createAgent, TeamServiceError } from "@/lib/services/team";
import { createAgentSchema } from "@/lib/team-schemas";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 16 * 1024;

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

    const parsed = createAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Données invalides." },
        { status: 400 },
      );
    }

    const agent = createAgent(parsed.data, actor.id);
    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof TeamServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}
