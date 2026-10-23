import "server-only";
import raw from "../../store.config";
import { storeConfigSchema, type StoreConfig } from "./schema";

const parsed = storeConfigSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error("store.config.ts invalide:\n" + parsed.error.issues.map(i => `- ${i.path.join(".")}: ${i.message}`).join("\n"));
}

export const storeConfig: Readonly<StoreConfig> = Object.freeze(parsed.data);
export const isRtl = storeConfig.locale === "ar";
export const htmlDir = isRtl ? "rtl" : "ltr";
export const whatsappLink = (message?: string) =>
  `https://wa.me/${storeConfig.contact.whatsapp}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
