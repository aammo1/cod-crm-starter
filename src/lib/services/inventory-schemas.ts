import { z } from "@/lib/validation";

export const stockQuantitySchema = z.number({ required_error: "Quantité requise.", invalid_type_error: "Quantité invalide." })
  .int("La quantité doit être un entier.").min(0, "La quantité doit être positive ou nulle.")
  .max(Number.MAX_SAFE_INTEGER, "Quantité trop élevée.");
export const stockRequestIdSchema = z.string().trim().min(1, "Identifiant de requête requis.").max(128, "Identifiant de requête trop long.");
export const stockVariantIdSchema = z.string().trim().min(1, "Variante requise.").max(200);
const openingItemSchema = z.object({ variantId: stockVariantIdSchema, qty: stockQuantitySchema }).strict();
export const stockOpeningSchema = z.union([
  openingItemSchema,
  z.object({ items: z.array(openingItemSchema).min(1).max(500) }).strict(),
]).superRefine((data, ctx) => {
  const items = "items" in data ? data.items : [data];
  if (new Set(items.map(item => item.variantId)).size !== items.length) {
    ctx.addIssue({ code: "custom", message: "Variante en double." });
  }
});
export const stockAdjustSchema = z.object({
  variantId: stockVariantIdSchema,
  requestId: z.string().uuid("Identifiant de requête invalide.").optional(),
  physicalDelta: z.number().int().safe().optional(),
  quarantineDelta: z.number().int().safe().optional(),
  reason: z.string().trim().min(1, "Motif requis.").max(500),
}).strict().refine(data => (data.physicalDelta ?? 0) !== 0 || (data.quarantineDelta ?? 0) !== 0,
  "Indiquez au moins un delta (physique ou quarantaine).");

export const stockBatchSchema = z.object({
  requestId: stockRequestIdSchema,
  mode: z.enum(["opening", "receive", "count"]),
  reason: z.string().trim().min(1).max(500).optional(),
  items: z.array(z.object({
    variantId: stockVariantIdSchema,
    qty: stockQuantitySchema,
    expected: z.object({
      physical: stockQuantitySchema,
      reserved: stockQuantitySchema,
      quarantine: stockQuantitySchema,
    }).strict().optional(),
  }).strict()).min(1).max(500),
}).strict().superRefine((data, ctx) => {
  const seen = new Set<string>();
  for (const [index, item] of data.items.entries()) {
    if (seen.has(item.variantId)) {
      ctx.addIssue({ code: "custom", path: ["items", index], message: "Variante en double." });
    }
    seen.add(item.variantId);
    if (data.mode === "receive" && item.qty === 0) {
      ctx.addIssue({ code: "custom", path: ["items", index, "qty"], message: "La quantité reçue doit être positive." });
    }
    if (data.mode === "count" && !item.expected) {
      ctx.addIssue({ code: "custom", path: ["items", index, "expected"], message: "Le stock attendu est requis pour une correction." });
    }
    if (data.mode !== "count" && item.expected) {
      ctx.addIssue({ code: "custom", path: ["items", index, "expected"], message: "Le stock attendu concerne uniquement les corrections." });
    }
  }
  if (data.mode === "count" && !data.reason) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "Le motif de correction est requis." });
  }
});

export type StockBatchInput = z.infer<typeof stockBatchSchema>;
