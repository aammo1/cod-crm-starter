import { z } from "zod";
import { SHIPPING_FEE, shippingFor } from "@/lib/pricing";

export const orderEditSchema = z.object({
  revision: z.string().length(64),
  lines: z.array(z.object({
    variantId: z.string().min(1, "Choisissez une variante pour chaque article.").max(200),
    qty: z.number().int("La quantité doit être entière.").min(1, "La quantité minimum est 1.").max(10, "Maximum 10 unités par variante."),
    // Only existing accepted upsell lines may retain their discounted price.
    upsellIndex: z.number().int().min(0).optional(),
  }).strict()).min(1, "Conservez au moins un article ou annulez la commande.").max(50),
  discountType: z.enum(["none", "fixed", "percent"]),
  discountValue: z.number().int().min(0).max(1_000_000),
  shippingMode: z.enum(["auto", "free", "paid"]),
  reason: z.string().trim().min(3, "Indiquez un motif (3 caractères minimum).").max(1000, "Le motif ne peut pas dépasser 1 000 caractères."),
}).strict().superRefine((input, ctx) => {
  if (input.discountType === "percent" && input.discountValue > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "La remise ne peut pas dépasser 100 %." });
  }
  if (input.discountType === "none" && input.discountValue !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "Supprimez le montant de la remise." });
  }
});

export type OrderEditInput = z.infer<typeof orderEditSchema>;
export type DiscountType = OrderEditInput["discountType"];
export type ShippingMode = OrderEditInput["shippingMode"];

export function orderEditTotals(
  regularSubtotal: number,
  upsellSubtotal: number,
  discountType: DiscountType,
  discountValue: number,
  shippingMode: ShippingMode,
) {
  const discountAmount = discountType === "percent"
    ? Math.round(regularSubtotal * discountValue / 100)
    : discountType === "fixed" ? discountValue : 0;
  const subtotal = regularSubtotal + upsellSubtotal;
  const netSubtotal = subtotal - discountAmount;
  const shipping = shippingMode === "free" ? 0 : shippingMode === "paid" ? SHIPPING_FEE : shippingFor(netSubtotal);
  return { subtotal, discountAmount, shipping, total: netSubtotal + shipping };
}
