import { z } from "@/lib/validation";
import { contentTypeForStoredName, isSafeStoredName } from "@/lib/uploads";
import { validateOptionDefinitions, validateVariantOptions, validateVariantSku } from "@/lib/variant-options";
import { stockQuantitySchema, stockRequestIdSchema } from "./inventory-schemas";

const text = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]+$/u);
export const catalogImageSchema = z.string().trim().max(500).refine((image) => {
  if (image.startsWith("/api/media/")) {
    const name = image.slice("/api/media/".length);
    return isSafeStoredName(name) && !!contentTypeForStoredName(name);
  }
  return /^\/images\/[A-Za-z0-9_./-]+\.(?:webp|png|jpe?g)$/i.test(image)
    && !image.slice(1).split("/").some((part) => !part || part === "." || part === "..");
}, "Utilisez un chemin d’image local valide.");
const imagesSchema = z.array(catalogImageSchema).max(30);
const optionsSchema = z.array(z.object({ name: text(80), value: text(120) }).strict()).max(3)
  .transform((value, ctx) => {
    try { return validateVariantOptions(value); }
    catch (error) { ctx.addIssue({ code: "custom", message: (error as Error).message }); return z.NEVER; }
  });
const definitionsSchema = z.array(z.object({ name: text(80), values: z.array(text(120)).min(1).max(100) }).strict()).max(3)
  .transform((value, ctx) => {
    try {
      const definitions = validateOptionDefinitions(value);
      if (definitions.reduce((count, axis) => count * axis.values.length, 1) > 100) throw new Error("Au maximum 100 combinaisons sont autorisées.");
      return definitions;
    } catch (error) { ctx.addIssue({ code: "custom", message: (error as Error).message }); return z.NEVER; }
  });
export const variantInputSchema = z.object({
  id: text(200).optional(),
  sku: text(100).refine((value) => { try { validateVariantSku(value); return true; } catch { return false; } }, "SKU invalide.").optional(),
  label: text(500).optional(), options: optionsSchema, images: imagesSchema.optional(), active: z.boolean().optional(),
}).strict();

export const productBaseSchema = z.object({
  name: text(200),
  slug: z.string().trim().max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide.").optional(),
  category: text(100), price: z.number().int().safe().min(1),
  description: z.string().trim().max(20000).default(""), story: z.string().trim().max(20000).default(""),
  materials: z.array(text(200)).max(50).default([]), badge: text(100).nullable().optional(),
  isBestSeller: z.boolean().default(false), upsellRef: text(200).nullable().optional(),
  images: imagesSchema.optional(), optionDefinitions: definitionsSchema.optional(),
  variants: z.array(variantInputSchema).min(1).max(100).optional(),
});
const initialStockSchema = z.union([
  z.object({ options: optionsSchema, qty: stockQuantitySchema }).strict(),
  z.object({ sku: text(100), qty: stockQuantitySchema }).strict(),
  z.object({ variantId: text(200), qty: stockQuantitySchema }).strict(),
]);
export const createProductSchema = productBaseSchema.extend({
  requestId: stockRequestIdSchema.optional(), initialStock: z.array(initialStockSchema).max(100).optional(),
}).strict();
// Reject initialStock, balances and availability on edits.
export const updateProductSchema = productBaseSchema.partial().strict();
export type CreateProductInput = z.input<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
