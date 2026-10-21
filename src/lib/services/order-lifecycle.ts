import { getDb, hasOrderFulfillmentHistory } from "@/lib/db";
import type { SessionUser } from "@/lib/auth-guards";
import { orderRulesKey } from "@/lib/services/order-lines";

export class OrderLifecycleError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.name = "OrderLifecycleError";
  }
}

/** Serialize against confirmation, workers, and upsells; a batch is all-or-nothing. */
export function changeOrderLifecycle(
  ids: string[],
  action: "archive" | "restore" | "delete",
  actor: Pick<SessionUser, "id" | "role">,
): number {
  if (action === "delete" && actor.role !== "admin") {
    throw new OrderLifecycleError(403, "Suppression réservée aux administrateurs.");
  }
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 100) {
    throw new OrderLifecycleError(400, "Sélectionnez entre 1 et 100 commandes.");
  }
  const db = getDb();
  return db.transaction(() => {
    const now = new Date().toISOString();
    for (const id of unique) {
      const order = db.prepare("SELECT archived_at, confirmation_status FROM orders WHERE id = ?")
        .get(id) as { archived_at: string | null; confirmation_status: string } | undefined;
      if (!order) throw new OrderLifecycleError(404, "Une commande sélectionnée est introuvable. Actualisez la liste.");
      if (action === "delete") {
        if (!order.archived_at) {
          throw new OrderLifecycleError(409, "Archivez les commandes avant de les supprimer définitivement.");
        }
        if (order.confirmation_status === "confirmed" || hasOrderFulfillmentHistory(id) ||
          db.prepare("SELECT 1 FROM stock_movements WHERE order_id = ? LIMIT 1").get(id) ||
          db.prepare("SELECT 1 FROM submission_resolutions WHERE order_id = ? LIMIT 1").get(id)) {
          throw new OrderLifecycleError(409, "Suppression impossible : une commande possède un historique de stock ou d’expédition. Conservez-la dans les archives.");
        }
        if (db.prepare("SELECT 1 FROM storefront_request_receipts WHERE order_id = ? LIMIT 1").get(id)) {
          throw new OrderLifecycleError(409, "Conservez cette commande dans les archives : ses reçus de commande doivent rester rejouables.");
        }
        // Remove only this order's durable conversion jobs, including pending jobs.
        db.prepare("DELETE FROM meta_events WHERE event_id IN (SELECT event_id FROM meta_purchases WHERE order_id = ?)").run(id);
        for (const table of ["meta_purchases", "manual_order_requests", "order_contacts"]) {
          db.prepare(`DELETE FROM ${table} WHERE order_id = ?`).run(id);
        }
        db.prepare("DELETE FROM orders WHERE id = ?").run(id);
        db.prepare("DELETE FROM app_state WHERE key = ?").run(orderRulesKey(id));
      } else if (action === "archive") {
        db.prepare("UPDATE orders SET archived_at = ?, archived_by = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL")
          .run(now, actor.id, now, id);
      } else {
        db.prepare("UPDATE orders SET archived_at = NULL, archived_by = NULL, updated_at = ? WHERE id = ? AND archived_at IS NOT NULL")
          .run(now, id);
      }
    }
    return unique.length;
  }).immediate();
}
