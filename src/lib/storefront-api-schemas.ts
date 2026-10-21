import { isIP } from "node:net";
import { z } from "./validation";
import { normalizeMaPhone } from "@/lib/phone";

const variantId = z.string().trim().min(1).max(200);
export const storefrontRequestKeySchema = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/);

/** Trusted storefront SERVER context, supplied only after its browser consent
 * checks. Omit meta entirely when tracking is declined. No CRM transport headers
 * are attribution: clientIpAddress must be the storefront's validated browser IP,
 * not arbitrary forwarded headers. sourceUrl is stripped to origin/path by the
 * commerce service before hashing/persistence; cookies are explicitly allowlisted.
 */
export const storefrontAttributionSchema = z.object({
  eventId: z.string().uuid(),
  sourceUrl: z.string().url().max(2048).refine((value) => {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password &&
      !/^(\/crm|\/admin|\/login)(\/|$)/.test(url.pathname);
  }),
  fbp: z.string().regex(/^fb\.\d+\.\d+\.[\w-]+$/).max(256).optional(),
  fbc: z.string().regex(/^fb\.\d+\.\d+\.[\w-]+$/).max(512).optional(),
  clientIpAddress: z.string().max(45).refine((value) => !!isIP(value)).optional(),
  clientUserAgent: z.string().max(1024).optional(),
}).strict();

export const storefrontCheckoutSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(200).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
    phone: z.string().max(100).refine((value) => !!normalizeMaPhone(value)),
  }).strict(),
  items: z.array(z.object({ variantId, qty: z.number().int().min(1).max(10) }).strict()).min(1).max(50),
  meta: storefrontAttributionSchema.optional(),
}).strict().superRefine((value, ctx) => {
  const quantities = new Map<string, number>();
  for (const item of value.items) {
    const qty = (quantities.get(item.variantId) ?? 0) + item.qty;
    quantities.set(item.variantId, qty);
    if (qty > 10) ctx.addIssue({ code: "custom", message: "Quantité maximale dépassée.", path: ["items"] });
  }
});

export const storefrontUpsellSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), variantId }).strict(),
  z.object({ action: z.literal("decline") }).strict(),
]);
