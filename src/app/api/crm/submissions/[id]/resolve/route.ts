import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import {
  resolveSubmission,
  resolveSubmissionSchema,
  SubmissionResolutionError,
} from "@/lib/services/submission-resolution";
import { readLimitedJsonOrNull, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 32 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body: unknown = await readLimitedJsonOrNull(request, MAX_BODY_BYTES);
    const parsed = resolveSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      resolveSubmission(id, parsed.data, {
        id: user.id,
        name: user.name ?? user.email ?? null,
      }),
    );
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SubmissionResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
