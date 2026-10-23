import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthGuardError, requireAdmin, requireUser } from "@/lib/auth-guards";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";
import { BlocklistError, blockPhone, listBlockedPhones } from "@/lib/services/customers";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 16 * 1024;

const addSchema = z.object({
  phone: z.string().trim().min(1, "Numéro invalide.").max(40, "Numéro invalide."),
  reason: z.string().trim().min(1, "Motif requis.").max(500, "Motif trop long (500 caractères maximum)."),
});

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
    return NextResponse.json({ blocked: listBlockedPhones() });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}

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
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
    }
    try {
      const result = blockPhone(parsed.data.phone, parsed.data.reason, user.id);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof BlocklistError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}
