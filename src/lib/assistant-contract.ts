import { z } from "./validation";

export const assistantPageSchema = z.object({
  pathname: z.string().max(200).regex(/^\/crm(?:\/[a-zA-Z0-9_%:-]+)*$/),
  filters: z.object({
    q: z.string().max(100).optional(),
    status: z.enum(["all", "new", "no_answer", "call_back_later", "confirmed", "cancelled"]).optional(),
    callbackDue: z.boolean().optional(),
    submission: z.array(z.enum(["queued", "submitting", "submitted", "failed", "needs_review"])).max(5).optional(),
    tracking: z.array(z.enum(["delivered", "refused", "cancelled", "return_in_transit", "in_transit", "at_facility", "out_for_delivery", "unknown"])).max(8).optional(),
    page: z.number().int().min(1).max(100).optional(),
    pageSize: z.literal(20).optional(),
  }).strict().optional(),
  productId: z.string().min(1).max(100).optional(),
  blId: z.string().min(1).max(100).optional(),
  selectedParcelIds: z.array(z.string().min(1).max(100)).max(10).optional(),
  selectionCount: z.number().int().min(0).max(200).optional(),
}).strict();
export type AssistantPageContext = z.infer<typeof assistantPageSchema>;

export const assistantRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(8000),
  }).strict()).min(1).max(12),
  orderId: z.string().max(100).optional(),
  context: assistantPageSchema.optional(),
}).strict().superRefine(({ messages }, ctx) => {
  if (messages.at(-1)?.role !== "user" || messages.reduce((n, m) => n + m.content.length, 0) > 24000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Conversation trop longue ou invalide." });
  }
  if (messages.some((message, index) => message.role !== (index % 2 === 0 ? "user" : "assistant"))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ordre des messages invalide." });
  }
});

export interface AssistantSource { label: string; href: string }
export type AssistantMood = "cheerful" | "grumpy";

export type AssistantEvent =
  | { type: "mood"; mood: AssistantMood }
  | { type: "text"; text: string }
  | { type: "status"; text: string }
  | { type: "sources"; sources: AssistantSource[] }
  | { type: "error"; text: string }
  | { type: "done" };

export const ASSISTANT_TOOL_LABELS: Record<string, string> = {
  priorities: "Lecture des priorités du jour…",
  searchOrders: "Recherche des commandes…",
  orderDetails: "Lecture de la commande…",
  shipping: "Lecture des expéditions…",
  stock: "Consultation du stock…",
  returnDetails: "Consultation du retour…",
  catalog: "Consultation du catalogue…",
  stockAudit: "Lecture des réservations et mouvements…",
  blDetails: "Analyse du bon de livraison…",
  trackingHistory: "Lecture de l’historique de suivi…",
  parcelFollowups: "Recherche des suivis à vérifier…",
  parcelDetails: "Lecture des colis sélectionnés…",
  returns: "Lecture des retours et inspections…",
  teamWorkload: "Lecture de la charge de l’équipe…",
  periodSummary: "Calcul des indicateurs de période…",
};
