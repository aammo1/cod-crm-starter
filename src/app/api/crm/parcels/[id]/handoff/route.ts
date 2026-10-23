import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { parcelHandoffSchema } from "@/lib/api-schemas";
import { HandoffError, handoffParcel } from "@/lib/services/expeditions";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 32 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { id } = await params;

    // The parcel id lives in the path; a body { parcelId } is tolerated when
    // present and must match it.
    let body: unknown = {};
    try {
      body = await readLimitedJson(request, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
      body = {};
    }
    const parsed = parcelHandoffSchema.safeParse(body ?? {});
    if (!parsed.success || (parsed.data.parcelId && parsed.data.parcelId !== id)) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    // Actor = agent email (displayed as-is on the board).
    const result = handoffParcel(id, user.email ?? user.id);
    return NextResponse.json({ ...result });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof HandoffError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
