import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";
import { ConfirmationError } from "@/lib/services/confirmation";
import { setDeliveryOutcome } from "@/lib/services/delivery-outcomes";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32 * 1024;

const deliveryOutcomeSchema = z.object({
  outcome: z.enum(["delivered", "refused"], { message: "Résultat de livraison invalide" }),
  reason: z.string().trim().max(500, "Motif trop long (500 caractères maximum).").optional(),
});

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
      if (error instanceof RequestBodyError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    const parsed = deliveryOutcomeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }

    const result = setDeliveryOutcome(
      id,
      parsed.data.outcome,
      { id: user.id, role: user.role },
      "agent",
      parsed.data.reason,
    );
    return NextResponse.json({
      outcome: result.outcome,
      at: result.at,
      by: result.by,
      source: result.source,
    });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof ConfirmationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
