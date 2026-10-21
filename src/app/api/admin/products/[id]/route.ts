import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { updateProduct } from "@/lib/services/catalog";
import { updateProductSchema } from "@/lib/services/catalog-schemas";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();

    const { id } = await params;
    const body: unknown = await request.json().catch(() => null);
    const parsed = updateProductSchema.parse(body);
    const product = updateProduct(id, parsed);
    revalidatePath("/", "layout");
    return NextResponse.json({ product }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Requête invalide." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Produit introuvable.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
