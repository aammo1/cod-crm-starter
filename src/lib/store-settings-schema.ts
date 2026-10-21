import { z } from "./validation";

/** Fixed v1 invariants, not editable settings or environment credentials. */
export const STORE_CURRENCY = "MAD" as const;
export const STORE_LANGUAGE = "fr" as const;
export const STORE_TIMEZONE = "Africa/Casablanca" as const;
/** Stable identity: changing the store's display name never moves stock. */
export const MAIN_INVENTORY_LOCATION_KEY = "MAIN" as const;

const madAmountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Complete persisted object. Unknown fields (including secrets) are rejected. */
export const storeSettingsSchema = z.object({
  storeName: z.string().trim().min(1, "Nom de boutique requis.").max(120, "Nom de boutique trop long."),
  shippingFeeMad: madAmountSchema,
  freeShippingThresholdMad: madAmountSchema,
  upsellEnabled: z.boolean(),
  upsellWindowSeconds: z.number().int().min(1).max(300),
  upsellDiscountPercent: z.number().int().min(1).max(90),
}).strict();

/** A partial update is merged with the current settings inside one transaction. */
export const storeSettingsUpdateSchema = storeSettingsSchema.partial().strict();

export type StoreSettings = z.infer<typeof storeSettingsSchema>;
export type StoreSettingsUpdate = z.infer<typeof storeSettingsUpdateSchema>;

export const DEFAULT_STORE_SETTINGS: Readonly<StoreSettings> = Object.freeze({
  storeName: "COD CRM",
  shippingFeeMad: 29,
  freeShippingThresholdMad: 400,
  upsellEnabled: true,
  upsellWindowSeconds: 20,
  upsellDiscountPercent: 30,
});

/** Deliberate allowlist for catalog clients; no upsell policy or private fields. */
export interface PublicStoreSettings {
  storeName: string;
  currency: typeof STORE_CURRENCY;
  shippingFeeMad: number;
  freeShippingThresholdMad: number;
}
