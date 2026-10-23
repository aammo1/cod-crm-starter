import { NextResponse } from "next/server";
import { revalidateStorefront } from "@/lib/storefront/revalidate";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { cancelOrderSchema } from "@/lib/api-schemas";
import { ConfirmationError, cancelOrder } from "@/lib/services/confirmation";
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

    let body: unknown;
    try {
      body = await readLimitedJson(request, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const parsed = cancelOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }

    cancelOrder(id, parsed.data, user);
    revalidateStorefront();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof ConfirmationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}