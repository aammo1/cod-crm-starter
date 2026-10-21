import { crm } from "../../../lib/crm";
import { checkoutInput } from "../../../lib/checkout-input";
import {
  boundKey, json, newSession, publicFailure, rateLimit, readBody, readSession,
  requireOwnOrigin, requireSession, withSession, PublicError,
} from "../../../lib/checkout-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bootstrap once BEFORE checkout; await it so the browser has its binding cookie. */
export async function PUT(request: Request) {
  try {
    requireOwnOrigin(request);
    const session = readSession(request);
    rateLimit(session);
    const body = await readBody(request, 16);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) {
      throw new PublicError(400, "INVALID_REQUEST");
    }
    return withSession(json({ ready: true }), session ?? newSession());
  } catch (error) { return publicFailure(error); }
}

export async function POST(request: Request) {
  try {
    requireOwnOrigin(request);
    const session = requireSession(request);
    rateLimit(session);
    const { attemptId, input } = checkoutInput(await readBody(request, 16_384));
    const result = await crm().createOrder(input, { idempotencyKey: boundKey(session, "checkout", attemptId) });
    session.order = { attempt: attemptId, id: result.orderId, token: result.orderToken };
    // Whitelist browser DTO. The token never enters JSON, props, logs or localStorage.
    return withSession(json({ orderId: result.orderId, totals: result.totals, upsellOffer: result.upsellOffer }), session);
  } catch (error) { return publicFailure(error); }
}
