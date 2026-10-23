import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { packsInputSchema, savePacksAndLanding } from "@/lib/services/packs";
import { revalidateStorefront } from "@/lib/storefront/revalidate";
import { z } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z.object({ landingEnabled: z.boolean(), packs: packsInputSchema }).strict();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
    const { id } = await params;
    const body: unknown = await request.json().catch(() => null);
    const parsed = bodySchema.parse(body);
    const result = savePacksAndLanding(id, parsed);
    revalidateStorefront();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Packs invalides : 4 packs maximum, quantités de 2 à 10, prix entiers en MAD." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Produit introuvable.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
