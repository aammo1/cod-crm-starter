import { NextResponse } from "next/server";
import { z } from "@/lib/validation";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { changeOrderLifecycle, OrderLifecycleError } from "@/lib/services/order-lifecycle";
import { readLimitedJsonOrNull, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 64 * 1024;

const schema = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1).max(100),
  action: z.enum(["archive", "restore", "delete"]),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await readLimitedJsonOrNull(request, MAX_BODY_BYTES));
    if (!parsed.success) {
      return NextResponse.json({ error: "Sélection ou action invalide (100 commandes maximum)." }, { status: 400 });
    }
    const count = changeOrderLifecycle(parsed.data.ids, parsed.data.action, user);
    return NextResponse.json({ count });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof OrderLifecycleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
