import { crm } from "../../../../lib/crm";
import { upsellInput } from "../../../../lib/checkout-input";
import {
  boundKey, json, PublicError, publicFailure, rateLimit, readBody, requireOwnOrigin, requireSession,
} from "../../../../lib/checkout-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireOwnOrigin(request);
    const session = requireSession(request);
    rateLimit(session);
    const { checkoutAttemptId, resolutionId, resolution } = upsellInput(await readBody(request, 2048));
    if (!session.order || session.order.attempt !== checkoutAttemptId) throw new PublicError(403, "ORDER_SESSION_MISMATCH");
    const result = await crm().resolveUpsell(session.order.id, resolution, {
      idempotencyKey: boundKey(session, `upsell:${session.order.id}`, resolutionId),
      orderToken: session.order.token,
    });
    return json({ orderId: result.orderId, upsellStatus: result.upsellStatus, totals: result.totals });
  } catch (error) { return publicFailure(error); }
}
