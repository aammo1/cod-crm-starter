import { getDb, getOrder, hasOrderFulfillmentHistory, type OrderItem, type OrderRow } from "@/lib/db";
import { getProductById } from "@/lib/services/catalog";
import {
  InsufficientStockError,
  releaseForOrder,
  reserveForOrder,
  type ReserveLine,
  type StockShortage,
} from "@/lib/services/inventory";
import { insertContact, type ConfirmationStatus } from "@/lib/services/orders";
import { createSubmission } from "@/lib/services/submissions";

export class ConfirmationError extends Error {
  readonly status: 400 | 404 | 409;
  readonly shortages: StockShortage[] | null;

  constructor(
    status: 400 | 404 | 409,
    message: string,
    shortages: StockShortage[] | null = null,
  ) {
    super(message);
    this.name = "ConfirmationError";
    this.status = status;
    this.shortages = shortages;
  }
}

export interface ConfirmActor {
  id: string;
  name?: string | null;
}

export interface ConfirmLineInput {
  lineIndex: number;
  variantId: string;
}

export interface ConfirmInput {
  lines: ConfirmLineInput[];
  address: string;
  cityId: number;
}

export interface ConfirmResult {
  created: boolean;
  submissionId: string | null;
}

export interface LineUpdateInput {
  lineIndex: number;
  variantId: string;
}

const CONFIRMABLE_STATUSES: ConfirmationStatus[] = [
  "new",
  "no_answer",
  "call_back_later",
];

interface VariantLookupRow {
  id: string;
  product_id: string;
  sku: string;
  size: string;
  active: number;
  color_name: string;
}

interface LatestSubmissionRow {
  id: string;
  status: string;
  tracking_number: string | null;
}

/**
 * One write path for the confirmation workflow. Every mutation runs inside a
 * single better-sqlite3 transaction started with `.immediate()`; the inner
 * transactions of reserveForOrder/createSubmission/insertContact then become
 * SAVEPOINTs, so a failure after the reserve step (e.g. InsufficientStockError,
 * a rejected submission insert) rolls the reservations, the order update and
 * the queued submission back together — all-or-nothing, nothing partial.
 */

function combinedLines(order: OrderRow): Array<{ item: OrderItem; upsell: boolean }> {
  const lines = order.items.map((item) => ({ item, upsell: false }));
  if (order.upsellStatus === "accepted") {
    for (const item of order.upsellItems ?? []) {
      lines.push({ item, upsell: true });
    }
  }
  return lines;
}

function findVariantById(variantId: string): VariantLookupRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT v.id, v.product_id, v.sku, v.size, v.active, c.name AS color_name
         FROM variants v
         JOIN product_colors c ON c.id = v.color_id
         WHERE v.id = ?`,
      )
      .get(variantId) as VariantLookupRow | undefined) ?? null
  );
}

function findVariantForLine(
  productId: string,
  colorName: string,
  size: string,
): VariantLookupRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT v.id, v.product_id, v.sku, v.size, v.active, c.name AS color_name
         FROM variants v
         JOIN product_colors c ON c.id = v.color_id
         WHERE v.product_id = ? AND c.name = ? AND v.size = ? AND v.active = 1
         LIMIT 1`,
      )
      .get(productId, colorName, size) as VariantLookupRow | undefined) ?? null
  );
}

function productActive(productId: string): boolean {
  const row = getDb()
    .prepare("SELECT active FROM products WHERE id = ?")
    .get(productId) as { active: number } | undefined;
  return row?.active === 1;
}

function latestSubmission(orderId: string): LatestSubmissionRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT id, status, tracking_number FROM courier_submissions
         WHERE order_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(orderId) as LatestSubmissionRow | undefined) ?? null
  );
}

function hasActiveReservations(orderId: string): boolean {
  return (
    getDb()
      .prepare(
        "SELECT 1 FROM reservations WHERE order_id = ? AND status = 'active' LIMIT 1",
      )
      .get(orderId) !== undefined
  );
}

function insufficientStockMessage(shortages: StockShortage[]): string {
  return shortages
    .map((s) => `Stock insuffisant pour ${s.sku} (${s.available} disponible(s))`)
    .join(" · ");
}

export function confirmOrder(
  orderId: string,
  input: ConfirmInput,
  actor: ConfirmActor,
): ConfirmResult {
  const db = getDb();
  return db.transaction((): ConfirmResult => {
    const order = getOrder(orderId);
    if (!order) throw new ConfirmationError(404, "Commande introuvable");

    if (order.confirmationStatus === "confirmed") {
      return { created: false, submissionId: latestSubmission(orderId)?.id ?? null };
    }
    if (order.confirmationStatus === "cancelled") {
      throw new ConfirmationError(409, "Commande annulée — confirmation impossible.");
    }
    if (!CONFIRMABLE_STATUSES.includes(order.confirmationStatus)) {
      throw new ConfirmationError(400, "Statut de commande incompatible avec la confirmation.");
    }
    if (hasOrderFulfillmentHistory(orderId)) {
      throw new ConfirmationError(
        409,
        "Cette commande a déjà été prise en charge — résolvez la réservation ou la transmission existante avant toute nouvelle confirmation.",
      );
    }

    const city = db.prepare("SELECT id, name FROM cities WHERE id = ?").get(
      input.cityId,
    ) as { id: number; name: string } | undefined;
    if (!city) {
      throw new ConfirmationError(400, "Ville inconnue — lancez la synchronisation des villes.");
    }

    const lines = combinedLines(order);
    if (lines.length === 0) {
      throw new ConfirmationError(400, "La commande ne contient aucun article.");
    }

    const overrides = new Map<number, string>();
    for (const line of input.lines) {
      if (overrides.has(line.lineIndex)) {
        throw new ConfirmationError(400, "Ligne en double dans la demande de confirmation.");
      }
      overrides.set(line.lineIndex, line.variantId);
    }

    const reserveLines: ReserveLine[] = [];
    const finalItems: OrderItem[] = [];
    const finalUpsellItems: OrderItem[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const { item, upsell } = lines[index];
      const providedVariantId = overrides.get(index);
      let variant: VariantLookupRow;
      if (providedVariantId) {
        const found = findVariantById(providedVariantId);
        if (!found) {
          throw new ConfirmationError(400, `Variante introuvable pour ${item.name}.`);
        }
        if (found.product_id !== item.product_id) {
          throw new ConfirmationError(400, `La variante choisie n'appartient pas à ${item.name}.`);
        }
        if (found.active !== 1) {
          throw new ConfirmationError(
            400,
            `La variante choisie pour ${item.name} n'est plus disponible.`,
          );
        }
        variant = found;
      } else if (upsell) {
        throw new ConfirmationError(
          400,
          `Sélectionnez la taille et la couleur pour la ligne upsell (${item.name}).`,
        );
      } else {
        const found = findVariantForLine(item.product_id, item.color, item.size);
        if (!found) {
          throw new ConfirmationError(
            400,
            `Variante indisponible pour ${item.name} (${item.color} / ${item.size}) — choisissez une autre variante.`,
          );
        }
        variant = found;
      }
      if (!productActive(item.product_id)) {
        throw new ConfirmationError(400, `Produit indisponible : ${item.name}.`);
      }
      reserveLines.push({ variantId: variant.id, qty: item.quantity });
      const resolved: OrderItem = {
        ...item,
        color: variant.color_name,
        size: variant.size,
      };
      if (upsell) {
        finalUpsellItems.push(resolved);
      } else {
        finalItems.push(resolved);
      }
    }

    try {
      reserveForOrder(orderId, reserveLines, actor.id, "crm");
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        throw new ConfirmationError(
          409,
          insufficientStockMessage(error.shortages),
          error.shortages,
        );
      }
      throw error;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE orders
       SET confirmation_status = 'confirmed', address = @address, city_id = @cityId,
           city_name = @cityName, items_json = @itemsJson, updated_at = @updatedAt,
           upsell_status = CASE WHEN upsell_status = 'pending' THEN 'declined' ELSE upsell_status END
       WHERE id = @orderId`,
    ).run({
      address: input.address,
      cityId: city.id,
      cityName: city.name,
      itemsJson: JSON.stringify(finalItems),
      updatedAt: now,
      orderId,
    });
    if (finalUpsellItems.length > 0) {
      db.prepare("UPDATE orders SET upsell_items_json = ? WHERE id = ?").run(
        JSON.stringify(finalUpsellItems),
        orderId,
      );
    }

    const submission = createSubmission(orderId);
    if (!submission) {
      throw new ConfirmationError(
        409,
        "Une transmission transporteur est déjà en file pour cette commande.",
      );
    }
    return { created: true, submissionId: submission.id };
  }).immediate();
}

export function cancelOrder(
  orderId: string,
  input: { reason: string },
  actor: ConfirmActor,
): void {
  const db = getDb();
  db.transaction(() => {
    const order = getOrder(orderId);
    if (!order) throw new ConfirmationError(404, "Commande introuvable");
    if (order.confirmationStatus === "cancelled") {
      throw new ConfirmationError(409, "Commande déjà annulée");
    }

    const submission = latestSubmission(orderId);
    if (submission) {
      if (submission.status === "submitted" || submission.tracking_number) {
        throw new ConfirmationError(
          409,
          "Colis déjà expédié — résolution manuelle auprès du transporteur.",
        );
      }
      if (submission.status === "submitting") {
        throw new ConfirmationError(
          409,
          "Transmission transporteur en cours — réessayez dans un instant.",
        );
      }
      if (submission.status === "needs_review") {
        // The courier may have created a parcel: stock stays reserved until an
        // agent verifies the portal and resolves the submission (R7/R8).
        throw new ConfirmationError(
          409,
          "Résultat transporteur incertain — vérifiez le portail Ozon et résolvez la soumission avant d'annuler.",
        );
      }
    }

    if (hasActiveReservations(orderId)) {
      releaseForOrder(orderId, actor.id, `Annulation commande ${orderId} — ${input.reason}`);
    }

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE orders SET confirmation_status = 'cancelled', updated_at = ? WHERE id = ?",
    ).run(now, orderId);
    db.prepare(`UPDATE courier_submissions SET status = 'failed',
      last_error = 'Commande annulée — pas de création de colis', updated_at = ?
      WHERE order_id = ? AND status = 'queued'`).run(now, orderId);
    insertContact({
      orderId,
      agentId: actor.id,
      channel: "note",
      outcome: "note",
      note: `Commande annulée. Motif : ${input.reason}`,
    });
  }).immediate();
}

export function updateOrderLine(
  orderId: string,
  input: LineUpdateInput,
  actor: ConfirmActor,
): OrderItem {
  const db = getDb();
  return db.transaction((): OrderItem => {
    const order = getOrder(orderId);
    if (!order) throw new ConfirmationError(404, "Commande introuvable");
    if (!CONFIRMABLE_STATUSES.includes(order.confirmationStatus)) {
      throw new ConfirmationError(
        409,
        "Les articles ne peuvent être modifiés que sur une commande non confirmée.",
      );
    }
    if (hasOrderFulfillmentHistory(orderId)) {
      throw new ConfirmationError(
        409,
        "Cette commande a déjà été prise en charge — ses articles ne peuvent plus être modifiés.",
      );
    }

    const upsellCount =
      order.upsellStatus === "accepted" ? (order.upsellItems?.length ?? 0) : 0;
    if (input.lineIndex >= order.items.length + upsellCount) {
      throw new ConfirmationError(400, "Ligne introuvable.");
    }
    if (input.lineIndex >= order.items.length) {
      throw new ConfirmationError(400, "La ligne upsell se choisit lors de la confirmation.");
    }

    const item = order.items[input.lineIndex];
    const product = getProductById(item.product_id);
    if (!product) throw new ConfirmationError(400, `Produit introuvable : ${item.name}.`);
    const variant = product.variants.find((v) => v.variantId === input.variantId);
    if (!variant || !variant.active) {
      throw new ConfirmationError(400, `Variante indisponible pour ${item.name}.`);
    }

    const items = order.items.map((it, index) =>
      index === input.lineIndex
        ? { ...it, color: variant.colorName, size: variant.size }
        : it,
    );
    const now = new Date().toISOString();
    db.prepare("UPDATE orders SET items_json = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(items),
      now,
      orderId,
    );
    insertContact({
      orderId,
      agentId: actor.id,
      channel: "note",
      outcome: "note",
      note: `Ligne modifiée : ${item.name} — ${item.color} / ${item.size} → ${variant.colorName} / ${variant.size} (SKU ${variant.sku})`,
    });
    return items[input.lineIndex];
  }).immediate();
}
