import { z } from "zod";

export const AD_CHANNELS = ["meta", "tiktok", "snap", "google", "other"] as const;
export type AdChannel = (typeof AD_CHANNELS)[number];

export const AD_CHANNEL_LABELS: Record<AdChannel, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  snap: "Snap",
  google: "Google",
  other: "Autre",
};

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }, "Date invalide.");

export const adSpendInputSchema = z.object({
  day: dayString,
  channel: z.enum(AD_CHANNELS, { message: "Canal invalide." }),
  campaign: z.string().trim().max(200, "Campagne trop longue (200 max).").default(""),
  amount: z
    .number({ message: "Montant invalide." })
    .int("Le montant doit être un entier en MAD.")
    .min(0, "Le montant doit être positif.")
    .max(100_000_000, "Montant trop élevé."),
  note: z.string().trim().max(500, "Note trop longue (500 max).").nullish(),
});

export const adSpendRangeSchema = z.object({ from: dayString, to: dayString });
export const adSpendGroupBySchema = z.enum(["channel", "campaign", "day"]);
export type AdSpendInput = z.infer<typeof adSpendInputSchema>;
