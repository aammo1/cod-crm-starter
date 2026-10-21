import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { archiveProduct } from "@/lib/services/catalog";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
    const { id } = await params;
    archiveProduct(id);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof Error && error.message === "Produit introuvable.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
