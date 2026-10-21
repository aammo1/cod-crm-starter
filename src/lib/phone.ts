import { z } from "zod";

/** Accepts 06/07XXXXXXXX, +212 6/7…, 212 6/7… — tolerant of spaces, dashes, dots, parens. */
export function normalizeMaPhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  const m = cleaned.match(/^(?:\+212|212|0)([67]\d{8})$/);
  return m ? `+212${m[1]}` : null;
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
