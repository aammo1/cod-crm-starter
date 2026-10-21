import { z } from "zod";
import { nameSchema, phoneSchema } from "@/lib/phone";

export const MANUAL_ORDER_SOURCES = [
  "manual_whatsapp",
  "manual_phone",
  "manual_instagram",
  "manual_other",
] as const;

export type ManualOrderSource = (typeof MANUAL_ORDER_SOURCES)[number];

export const MANUAL_ORDER_SOURCE_LABELS: Record<ManualOrderSource, string> = {
  manual_whatsapp: "WhatsApp",
  manual_phone: "Téléphone",
  manual_instagram: "Instagram",
  manual_other: "Autre",
};

export const manualOrderItemSchema = z.object({
  variantId: z.string().trim().min(1, "Variante requise"),
  qty: z
    .number({
      required_error: "La quantité est requise",
      invalid_type_error: "La quantité doit être un nombre",
    })
    .int("La quantité doit être un entier")
    .min(1, "La quantité minimale est 1")
    .max(10, "La quantité maximale par article est 10"),
});

export type ManualOrderItemInput = z.infer<typeof manualOrderItemSchema>;

export const manualOrderInputSchema = z
  .object({
    requestId: z
      .string()
      .trim()
      .uuid("Identifiant de requête invalide (UUID attendu)"),
    customer: z.object({
      name: nameSchema,
      phone: phoneSchema,
    }),
    items: z
      .array(manualOrderItemSchema)
      .min(1, "Au moins un article est requis")
      .max(100, "Nombre maximal d'articles dépassé (100 maximum)"),
    source: z.enum(MANUAL_ORDER_SOURCES, {
      errorMap: () => ({ message: "Source de commande invalide" }),
    }),
    address: z
      .string()
      .trim()
      .max(500, "L'adresse ne peut pas dépasser 500 caractères")
      .nullish()
      .transform((val) => (val && val.length > 0 ? val : undefined)),
    cityId: z
      .number({ invalid_type_error: "L'identifiant de ville doit être un entier" })
      .int("L'identifiant de ville doit être un entier")
      .positive("L'identifiant de ville doit être un entier positif")
      .nullish()
      .transform((val) => val ?? undefined),
    note: z
      .string()
      .trim()
      .max(2000, "La note ne peut pas dépasser 2000 caractères")
      .nullish()
      .transform((val) => (val && val.length > 0 ? val : undefined)),
  })
  .superRefine((data, ctx) => {
    const aggregated = new Map<string, number>();
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const current = aggregated.get(item.variantId) ?? 0;
      const total = current + item.qty;
      if (total > 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La quantité cumulée pour un même article ne peut pas dépasser 10.",
          path: ["items", i, "qty"],
        });
      }
      aggregated.set(item.variantId, total);
    }
  });

export type ManualOrderInput = z.infer<typeof manualOrderInputSchema>;
