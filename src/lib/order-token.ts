import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Server-only: never import this module into a client component. Rotation of
// AUTH_SECRET invalidates outstanding tokens and reconstructed checkout replays;
// retain the issuing secret until outstanding offers/replays have been retired.
export class OrderTokenConfigurationError extends Error {
  readonly status = 503;
  readonly code = "ORDER_TOKEN_UNAVAILABLE";
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new OrderTokenConfigurationError("AUTH_SECRET est requis pour les jetons de commande.");
  return value;
}

export function createOrderNonce(): string {
  return randomBytes(32).toString("hex");
}

export function deriveOrderToken(orderId: string, nonce: string): string {
  return createHmac("sha256", secret())
    .update(JSON.stringify(["storefront-order-v1", orderId, nonce])).digest("base64url");
}

export function orderTokenVerifier(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyOrderToken(orderId: string, nonce: string, verifier: string, token: string): boolean {
  const expected = deriveOrderToken(orderId, nonce);
  const equal = (a: string, b: string) => {
    const left = Buffer.from(a); const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };
  return equal(orderTokenVerifier(expected), verifier) && equal(expected, token);
}
