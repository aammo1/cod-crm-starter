import { z } from "./validation";

export const tiktokContextSchema = z.object({
  eventId: z.string().uuid(),
  sourceUrl: z.string().url().max(2048),
  ttp: z.string().max(256).regex(/^[\w.-]+$/).optional(), // _ttp cookie
  ttclid: z.string().max(512).regex(/^[\w.-]+$/).optional(), // click id from ?ttclid=
}).strict();
export type TikTokAttribution = z.infer<typeof tiktokContextSchema>;

export type TikTokUser = { ttp?: string; ttclid?: string; ip?: string; user_agent: string };
export type TikTokContext = { eventId: string; sourceUrl: string; user: TikTokUser };
export type TikTokProperties = {
  currency?: "MAD";
  value?: number;
  content_type?: "product";
  contents?: { content_id: string; content_name?: string; quantity: number; price: number }[];
};
