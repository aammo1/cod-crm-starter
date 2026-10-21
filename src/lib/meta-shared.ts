import { z } from "./validation";

export const metaContextSchema = z.object({
  eventId: z.string().uuid(),
  sourceUrl: z.string().url().max(2048),
  fbp: z.string().regex(/^fb\.\d+\.\d+\.[\w-]+$/).max(256).optional().catch(undefined),
  fbc: z.string().regex(/^fb\.\d+\.\d+\.[\w-]+$/).max(512).optional().catch(undefined),
});
export type MetaContext = z.infer<typeof metaContextSchema>;
export type MetaParams = {
  content_ids?: string[];
  content_name?: string;
  content_type?: "product";
  contents?: { id: string; quantity: number; item_price: number }[];
  currency?: "MAD";
  value?: number;
  num_items?: number;
};
export type MetaPurchase = { eventId: string; params: MetaParams };
