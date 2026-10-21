import { z } from "zod";
import type { Badge, CategorySlug } from "@/lib/types";
import { stockQuantitySchema, stockRequestIdSchema } from "./inventory-schemas";

const CATEGORY_VALUES = ["escarpins", "sandales", "bottines", "mocassins"] as const satisfies readonly CategorySlug[];
const BADGE_VALUES = ["Nouveau", "Best-seller", "Édition limitée"] as const satisfies readonly Badge[];

export const colorInputSchema = z.object({
  name: z
    .string({ required_error: "Le nom de la couleur est requis." })
    .trim()
    .min(1, "Le nom de la couleur est requis.")
    .max(60, "Le nom de la couleur ne doit pas dépasser 60 caractères."),
  hex: z
    .string({ required_error: "Le code couleur est requis." })
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Le code couleur doit être un hexadécimal à 6 chiffres (ex. #1A1A1A)."),
  images: z
    .array(z.string().trim().min(1, "Chemin d'image invalide."))
    .max(30, "Une couleur ne peut pas avoir plus de 30 images."),
});

const sizeSchema = z
  .number({
    required_error: "La pointure est requise.",
    invalid_type_error: "La pointure doit être un nombre.",
  })
  .int("La pointure doit être un nombre entier.")
  .min(30, "Les pointures doivent être comprises entre 30 et 45.")
  .max(45, "Les pointures doivent être comprises entre 30 et 45.");

export const productBaseSchema = z.object({
  name: z
    .string({ required_error: "Le nom du produit est requis." })
    .trim()
    .min(1, "Le nom du produit est requis.")
    .max(120, "Le nom du produit ne doit pas dépasser 120 caractères."),
  slug: z
    .string()
    .trim()
    .min(1, "Le slug ne peut pas être vide.")
    .max(120, "Le slug ne doit pas dépasser 120 caractères.")
    .optional(),
  category: z.enum(CATEGORY_VALUES, {
    errorMap: () => ({ message: "Catégorie invalide (escarpins, sandales, bottines ou mocassins)." }),
  }),
  price: z
    .number({ required_error: "Le prix est requis.", invalid_type_error: "Le prix doit être un nombre." })
    .int("Le prix doit être un nombre entier de MAD.")
    .min(1, "Le prix doit être d'au moins 1 MAD."),
  description: z
    .string({ required_error: "La description est requise." })
    .trim()
    .min(1, "La description est requise."),
  story: z
    .string({ required_error: "L'histoire du produit est requise." })
    .trim()
    .min(1, "L'histoire du produit est requise."),
  materials: z
    .array(z.string().trim().min(1, "Matériau invalide."))
    .min(1, "Au moins un matériau est requis."),
  badge: z
    .enum(BADGE_VALUES, { errorMap: () => ({ message: "Badge invalide." }) })
    .optional(),
  isBestSeller: z.boolean({
    required_error: "isBestSeller est requis.",
    invalid_type_error: "isBestSeller doit être un booléen.",
  }),
  upsellRef: z
    .string()
    .trim()
    .min(1, "upsellRef ne peut pas être vide.")
    .optional(),
  colors: z.array(colorInputSchema).min(1, "Au moins une couleur est requise."),
  sizes: z.array(sizeSchema).min(1, "Au moins une pointure est requise."),
});

const noDuplicateSizes = (sizes: number[] | undefined): boolean =>
  sizes === undefined || new Set(sizes).size === sizes.length;

const duplicateSizesParams = {
  message: "Les pointures ne doivent pas être en double.",
  path: ["sizes"],
};

export const createProductSchema = productBaseSchema.extend({
  requestId: stockRequestIdSchema.optional(),
  initialStock: z.array(z.object({
    // Creation colors have no persisted ID yet: their exact name is the key.
    colorKey: z.string().trim().min(1),
    size: z.string().trim().min(1),
    qty: stockQuantitySchema,
  }).strict()).max(500).optional(),
}).refine(
  (data) => noDuplicateSizes(data.sizes),
  duplicateSizesParams,
).superRefine((data, ctx) => {
  const colors = new Set(data.colors.map((color) => color.name));
  if (colors.size !== data.colors.length) {
    ctx.addIssue({ code: "custom", path: ["colors"], message: "Les couleurs ne doivent pas être en double." });
  }
  const sizes = new Set(data.sizes.map(String));
  const seen = new Set<string>();
  for (const [index, item] of (data.initialStock ?? []).entries()) {
    const key = JSON.stringify([item.colorKey, item.size]);
    if (!colors.has(item.colorKey) || !sizes.has(item.size)) {
      ctx.addIssue({ code: "custom", path: ["initialStock", index], message: "Le stock initial doit correspondre à une couleur et une pointure du produit." });
    }
    if (seen.has(key)) {
      ctx.addIssue({ code: "custom", path: ["initialStock", index], message: "Stock initial en double pour cette couleur et cette pointure." });
    }
    seen.add(key);
  }
});

export const updateProductSchema = productBaseSchema.partial().refine(
  (data) => noDuplicateSizes(data.sizes),
  duplicateSizesParams,
);

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
