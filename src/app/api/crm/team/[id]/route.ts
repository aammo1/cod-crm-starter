import { NextResponse } from "next/server";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { TeamServiceError, updateAgent } from "@/lib/services/team";
import { updateAgentSchema } from "@/lib/team-schemas";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 16 * 1024;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireAdmin();
    const { id } = await params;

    let body: unknown;
    try {
      body = await readLimitedJson(request, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }

    const parsed = updateAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Données invalides." },
        { status: 400 },
      );
    }

    const agent = updateAgent(id, parsed.data, actor.id);
    return NextResponse.json({ agent }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof TeamServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}
