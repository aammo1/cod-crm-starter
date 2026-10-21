import { tool } from "ai";
import { z } from "./validation";
import type { AssistantSource } from "@/lib/assistant-contract";
import { TRACKING_STATUSES } from "@/lib/shipping/status-map";
import {
  assistantPeriod, readAssistantBl, readAssistantCatalog, readAssistantParcelFollowups, readAssistantParcels,
  readAssistantPeriod, readAssistantReturns, readAssistantStockAudit, readAssistantTeam, readAssistantTracking,
} from "@/lib/services/assistant-investigation";
import {
  readAssistantOrder, readAssistantOrders, readAssistantPriorities,
  readAssistantReturn, readAssistantShipping, readAssistantStock, sanitizeAssistantData,
} from "@/lib/services/assistant-data";

export function createAssistantTools(addSource: (source: AssistantSource) => void) {
  let calls = 0;
  let characters = 0;
  function read(fn: () => unknown, source: AssistantSource) {
    if (++calls > 8 || characters >= 45000) return { error: "Limite de consultation atteinte. Résumez les données déjà consultées." };
    try {
      const data = sanitizeAssistantData(fn());
      const size = JSON.stringify(data).length;
      if (size + characters > 45000) return { error: "Résultat trop volumineux. Affinez votre recherche." };
      characters += size;
      addSource(source);
      return { consultedAt: new Date().toISOString(), limits: "Extraits bornés : au plus 20 éléments par liste et 600 caractères par champ texte. Seuls les compteurs explicitement globaux sont des totaux.", data };
    } catch {
      // Never send raw DB/provider errors into model context.
      return { error: "Consultation indisponible. Ne déduisez aucun statut ni résultat." };
    }
  }
  const id = z.string().trim().min(1).max(100);
  const page = z.number().int().min(1).max(100).default(1);
  return {
    priorities: tool({
      description: "Priorités et compteurs globaux actuels du CRM : nouvelles commandes, rappels dus, soumissions, BL, retours, stock faible et fraîcheur du suivi. Les lignes sont des exemples limités, les compteurs sont globaux.",
      inputSchema: z.object({}).strict(),
      execute: async () => read(readAssistantPriorities, { label: "Priorités du jour", href: "/crm" }),
    }),
    searchOrders: tool({
      description: "Rechercher une commande par nom, téléphone ou identifiant, ou filtrer par confirmation, rappels dus, agent et suivi. Pages de 10 par défaut ; pageSize=20 permet de retrouver exactement la pagination de la liste CRM et son contexte de page.",
      inputSchema: z.object({
        q: z.string().max(100).optional(),
        status: z.enum(["all", "new", "no_answer", "call_back_later", "confirmed", "cancelled"]).optional(),
        callbackDue: z.boolean().optional(),
        submission: z.array(z.enum(["queued", "submitting", "submitted", "failed", "needs_review"])).max(5).optional(),
        tracking: z.array(z.enum(TRACKING_STATUSES)).max(8).optional(),
        assignedTo: id.optional(),
        page: z.number().int().min(1).max(100).optional(),
        pageSize: z.union([z.literal(10), z.literal(20)]).optional(),
      }).strict(),
      execute: async (options) => read(() => readAssistantOrders(options), { label: "Commandes", href: "/crm/orders" }),
    }),
    orderDetails: tool({
      description: "Lire une commande par identifiant exact : articles, confirmation, contacts récents, soumission, dernier suivi enregistré et retour éventuel. Ni adresse précise ni téléphone ne sont fournis.",
      inputSchema: z.object({ id }).strict(),
      execute: async ({ id }) => read(() => readAssistantOrder(id), { label: `Commande ${id}`, href: `/crm/orders/${encodeURIComponent(id)}` }),
    }),
    shipping: tool({
      description: "Extraits limités du tableau d’expéditions : prêts pour BL, opérations BL à résoudre, BL enregistrés et remises récentes. Aucun appel au transporteur.",
      inputSchema: z.object({}).strict(),
      execute: async () => read(readAssistantShipping, { label: "Expéditions et BL", href: "/crm/expeditions" }),
    }),
    stock: tool({
      description: "Disponibilité actuelle par produit, libellé, options ou SKU, avec productId exact facultatif. Pages de 20 variantes triées par disponibilité ; suivre nextPage si nécessaire. Aucun extrait ne constitue un total global.",
      inputSchema: z.object({ q: z.string().max(100), threshold: z.number().int().min(0).max(1000).optional(), page, productId: id.optional() }).strict(),
      execute: async ({ q, threshold, page, productId }) => read(() => readAssistantStock(q, threshold, page, productId), { label: "Stock par variante", href: "/crm/stock" }),
    }),
    returnDetails: tool({
      description: "Lire un retour par identifiant exact. Pour trouver un retour lié à une commande, utiliser orderDetails ; pour les retours en attente, priorities.",
      inputSchema: z.object({ id, page }).strict(),
      execute: async ({ id, page }) => read(() => readAssistantReturn(id, page), { label: "Retours", href: "/crm/retours" }),
    }),
    catalog: tool({
      description: "Rechercher les produits actifs, leur description et leur prix catalogue en MAD. Pages de 10 produits. Pour variantes, options, SKU et disponibilité : utiliser stock avec productId.",
      inputSchema: z.object({ q: z.string().max(100), page }).strict(),
      execute: async ({ q, page }) => read(() => readAssistantCatalog(q, page), { label: "Catalogue produits", href: "/admin" }),
    }),
    stockAudit: tool({
      description: "Expliquer la disponibilité avec le solde, les réservations et mouvements réels. Exiger variantId ou orderId, obtenus des outils. Pages de 20 par liste ; soldes actuels, historique éventuellement partiel.",
      inputSchema: z.object({ variantId: id.optional(), orderId: id.optional(), page }).strict().refine((input) => !!(input.variantId || input.orderId), "Une variante ou commande est requise."),
      execute: async (input) => read(() => readAssistantStockAudit(input), { label: "Réservations et mouvements", href: "/crm/stock" }),
    }),
    blDetails: tool({
      description: "Détail d’un BL par identifiant opération, identifiant BL ou référence exacte : étape, état, sélection, événements et réconciliations. Pages de 20 par liste. Ne jamais déduire qu’un incident incertain permet une nouvelle tentative.",
      inputSchema: z.object({ id, page }).strict(),
      execute: async ({ id, page }) => read(() => readAssistantBl(id, page), { label: "Détail et historique BL", href: "/crm/expeditions" }),
    }),
    trackingHistory: tool({
      description: "Lire le dernier état enregistré et l’historique d’observations d’un colis. Fournir exactement orderId ou submissionId. Certaines observations historiques sont ignorées ; seul l’état courant fait foi. Pages de 20.",
      inputSchema: z.object({ orderId: id.optional(), submissionId: id.optional(), page }).strict().refine((input) => !!input.orderId !== !!input.submissionId, "Un identifiant unique est requis."),
      execute: async (input) => read(() => readAssistantTracking(input), { label: "Historique du suivi", href: input.orderId ? `/crm/orders/${encodeURIComponent(input.orderId)}` : "/crm/expeditions" }),
    }),
    parcelDetails: tool({
      description: "Lire en une seule requête jusqu’à 10 colis par identifiants de soumission exacts, notamment ceux sélectionnés sur la page. État, commande et rattachement BL, sans données brutes du transporteur.",
      inputSchema: z.object({ submissionIds: z.array(id).min(1).max(10) }).strict(),
      execute: async ({ submissionIds }) => read(() => readAssistantParcels(submissionIds), { label: "Colis sélectionnés", href: "/crm/expeditions" }),
    }),
    parcelFollowups: tool({
      description: "Colis soumis non terminés sans nouvelle observation enregistrée depuis X jours. Ce n’est pas la preuve d’une immobilisation physique ; vérifier lastSyncAt. Pages de 20.",
      inputSchema: z.object({ days: z.number().int().min(1).max(30), page }).strict(),
      execute: async ({ days, page }) => read(() => readAssistantParcelFollowups(days, page), { label: "Suivis à vérifier", href: "/crm/orders?status=all&tracking=in_transit,at_facility,out_for_delivery,unknown" }),
    }),
    returns: tool({
      description: "Lister les retours par étape : returning (en retour), received (à inspecter), inspected. Pages de 20 ; returnDetails fournit les lignes d’inspection d’un retour.",
      inputSchema: z.object({ status: z.enum(["all", "returning", "received", "inspected"]), page }).strict(),
      execute: async ({ status, page }) => read(() => readAssistantReturns(status, page), { label: "Retours et inspections", href: "/crm/retours" }),
    }),
    teamWorkload: tool({
      description: "Charge opérationnelle actuelle de l’équipe : commandes assignées en attente de confirmation, rappels planifiés, commandes non assignées. Pas un classement de performance. Pages de 20, sans informations de connexion.",
      inputSchema: z.object({ page }).strict(),
      execute: async ({ page }) => read(() => readAssistantTeam(page), { label: "Répartition de l’équipe", href: "/crm/equipe" }),
    }),
    periodSummary: tool({
      description: "Compteurs SQL de cohortes de commandes créées pendant 1 à 31 jours calendaires inclusifs en Africa/Casablanca, avec comparaison à la période précédente de même durée. Les statuts sont ACTUELS, pas des transitions datées ; aucun encaissement calculé.",
      inputSchema: z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), comparePrevious: z.boolean() }).strict().refine(({ startDate, endDate }) => { try { assistantPeriod(startDate, endDate); return true; } catch { return false; } }, "Période valide de 1 à 31 jours requise."),
      execute: async ({ startDate, endDate, comparePrevious }) => read(() => readAssistantPeriod(startDate, endDate, comparePrevious), { label: "Indicateurs des commandes", href: "/crm" }),
    }),
  };
}
