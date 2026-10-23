import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";
import {
  commitRemittance,
  getUnpaidAging,
  listRemittances,
  previewStatement,
  RemittanceError,
} from "@/lib/services/cod-remittances";
import { log } from "@/lib/log";

export const runtime = "nodejs";
// Courier statements are pasted/uploaded as CSV text inside JSON: 1 MiB (task spec) covers ~5000 rows.
const MAX_BODY_BYTES = 1024 * 1024;

const previewSchema = z.object({
  action: z.literal("preview"),
  csv: z.string().min(1).max(MAX_BODY_BYTES),
  mapping: z.unknown().optional(),
});

function fail(error: unknown): NextResponse {
  if (error instanceof AuthGuardError) return error.toResponse();
  if (error instanceof RemittanceError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
  log.error("remittances route failed", { error });
  return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
}

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
    return NextResponse.json({ remittances: listRemittances(), aging: getUnpaidAging() });
  } catch (error) {
    return fail(error);
  }
}

/** Body: {action:"preview", csv, mapping?} or a commit payload (rows[] from a statement, or orderIds[]). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireAdmin();
    const body = await readLimitedJson(request, MAX_BODY_BYTES);
    if (body && typeof body === "object" && (body as { action?: unknown }).action === "preview") {
      const parsed = previewSchema.safeParse(body);
      if (!parsed.success) throw new RemittanceError(400, "Fichier CSV invalide.");
      return NextResponse.json({ preview: previewStatement(parsed.data.csv, parsed.data.mapping) });
    }
    const result = commitRemittance(body, actor.id);
    return NextResponse.json({ ...result, aging: getUnpaidAging() }, { status: result.remittance ? 201 : 200 });
  } catch (error) {
    return fail(error);
  }
}
