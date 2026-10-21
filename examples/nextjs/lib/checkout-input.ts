import "server-only";
import { z } from "zod";
import type { CheckoutInput } from "../../../integrations/storefront-client";
import { PublicError, storefrontOrigin } from "./checkout-session";

const attempt = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/);
const variantId = z.string().trim().min(1).max(200);
const normalizedPhone = (raw: string) => {
  const match = /^(?:\+212|212|0)([67]\d{8})$/.exec(raw.replace(/[\s\-().]/g, ""));
  return match ? `+212${match[1]}` : null;
};
const attribution = z.object({
  consent: z.literal(true), eventId: z.string().uuid(),
  sourceUrl: z.string().url().max(2048).refine((value) => {
    const url = new URL(value);
    return url.origin === storefrontOrigin() && !url.username && !url.password &&
      !/^(\/crm|\/admin|\/login)(\/|$)/.test(url.pathname);
  }),
  fbp: z.string().regex(/^fb\.\d+\.\d+\.[\w-]+$/).max(256).optional(),
  fbc: z.string().regex(/^fb\.\d+\.\d+\.[\w-]+$/).max(512).optional(),
}).strict();
const checkout = z.object({
  attemptId: attempt,
  customer: z.object({
    name: z.string().trim().min(2).max(200).refine((s) => !/[\u0000-\u001f\u007f]/.test(s)),
    phone: z.string().max(100).refine((s) => normalizedPhone(s) !== null),
  }).strict(),
  items: z.array(z.object({ variantId, qty: z.number().int().min(1).max(10) }).strict()).min(1).max(50),
  attribution: attribution.optional(),
}).strict();
export function checkoutInput(raw: unknown): { attemptId: string; input: CheckoutInput } {
  const parsed = checkout.safeParse(raw);
  if (!parsed.success) throw new PublicError(400, "INVALID_REQUEST");
  const { attemptId, customer, items, attribution: tracking } = parsed.data;
  const quantities = new Map<string, number>();
  for (const item of items) {
    const qty = (quantities.get(item.variantId) ?? 0) + item.qty;
    if (qty > 10) throw new PublicError(400, "INVALID_REQUEST");
    quantities.set(item.variantId, qty);
  }
  return { attemptId, input: {
    customer: { name: customer.name, phone: normalizedPhone(customer.phone)! },
    items: [...quantities].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, qty]) => ({ variantId: id, qty })),
    ...(tracking ? { meta: {
      eventId: tracking.eventId,
      sourceUrl: (() => { const url = new URL(tracking.sourceUrl); return url.origin + url.pathname; })(),
      ...(tracking.fbp ? { fbp: tracking.fbp } : {}), ...(tracking.fbc ? { fbc: tracking.fbc } : {}),
    } } : {}),
  } };
}
const resolution = z.object({
  checkoutAttemptId: attempt, resolutionId: attempt,
  resolution: z.discriminatedUnion("action", [
    z.object({ action: z.literal("accept"), variantId }).strict(),
    z.object({ action: z.literal("decline") }).strict(),
  ]),
}).strict();
export function upsellInput(raw: unknown) {
  const parsed = resolution.safeParse(raw);
  if (!parsed.success) throw new PublicError(400, "INVALID_REQUEST");
  return parsed.data;
}
