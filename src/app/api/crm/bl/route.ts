import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { createBlSchema } from "@/lib/api-schemas";
import { BlError, createOrResumeBl } from "@/lib/services/expeditions";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireUser();

    let body: unknown;
    try {
      body = await readLimitedJson(request, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const parsed = createBlSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }

    const result = await createOrResumeBl(parsed.data.submissionIds, user);
    return NextResponse.json(
      { bl: result.bl, pdf: result.pdf, created: result.created, resumed: result.resumed },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof BlError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.stage ? { stage: error.stage } : {}),
          ...(error.bl ? { bl: error.bl } : {}),
          ...(error.operationId ? { operationId: error.operationId } : {}),
        },
        { status: error.status },
      );
    }
    throw error;
  }
}
