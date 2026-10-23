import { normalizeMaPhoneCore } from "./phone-core";
import { z } from "./validation";

/** Accepts 06/07XXXXXXXX, +212 6/7…, 00212…, Arabic-Indic digits — see phone-core. */
export function normalizeMaPhone(raw: string): string | null {
  return normalizeMaPhoneCore(raw);
}

/** Ozon expects the local format 06XXXXXXXX (+2126XXXXXXXX → 06XXXXXXXX). */
export function toOzonPhone(normalized: string): string {
  const m = normalized.match(/^\+212([67]\d{8})$/);
  return m ? `0${m[1]}` : normalized;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Le numéro de téléphone est requis")
  .refine((v) => normalizeMaPhone(v) !== null, {
    message: "Numéro marocain invalide (ex : 0612345678)",
  });

export const nameSchema = z.string().trim().min(2, "Votre nom est requis");
