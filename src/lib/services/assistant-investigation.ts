import { getDb } from "@/lib/db";
import { casablancaLocalToUtcIso } from "@/lib/services/orders";
import { DEFAULT_LOCATION } from "@/lib/services/inventory";

// LIMIT + 1 supplies pagination without COUNT(*) over every matching record.
export function assistantPage<T>(rows: T[], page: number, size = 20) {
  const hasMore = rows.length > size;
  return { rows: rows.slice(0, size), page, hasMore, nextPage: hasMore && page < 100 ? page + 1 : null, pageLimitReached: hasMore && page >= 100 };
}

export function readAssistantCatalog(q: string, page: number) {
  return assistantPage(getDb().prepare(`
    SELECT id, slug, name, category, price, substr(description, 1, 600) AS description
    FROM products WHERE active = 1 AND (name LIKE @q OR slug LIKE @q OR category LIKE @q)
    ORDER BY name, id LIMIT 11 OFFSET @offset
  `).all({ q: `%${q}%`, offset: (page - 1) * 10 }), page, 10);
}

export function readAssistantStockAudit(input: { variantId?: string; orderId?: string; page: number }) {
  const { variantId, orderId, page } = input;
  if (!variantId && !orderId) throw new Error("Une cible est requise.");
  const where = [variantId ? "variant_id = @variantId" : "", orderId ? "order_id = @orderId" : ""].filter(Boolean).join(" AND ");
  const params = { ...(variantId ? { variantId } : {}), ...(orderId ? { orderId } : {}), offset: (page - 1) * 20 };
  const db = getDb();
  const movements = db.prepare(`SELECT variant_id AS variantId, order_id AS orderId,
    kind, qty, reason, source, created_at AS createdAt FROM stock_movements
    WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET @offset`).all(params);
  const reservations = db.prepare(`SELECT variant_id AS variantId, order_id AS orderId,
    qty, status, created_at AS createdAt, resolved_at AS resolvedAt FROM reservations
    WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET @offset`).all(params);
  const balance = variantId ? db.prepare(`SELECT v.id AS variantId, v.sku, v.size, p.name AS product,
    c.name AS color, COALESCE(b.physical, 0) AS physical, COALESCE(b.reserved, 0) AS reserved,
    COALESCE(b.quarantine, 0) AS quarantine,
    MAX(0, COALESCE(b.physical, 0) - COALESCE(b.reserved, 0) - COALESCE(b.quarantine, 0)) AS available
    FROM variants v JOIN products p ON p.id = v.product_id JOIN product_colors c ON c.id = v.color_id
    LEFT JOIN stock_balances b ON b.variant_id = v.id AND b.location = @location
    WHERE v.id = @variantId`).get({ variantId, location: DEFAULT_LOCATION }) : null;
  return { balance, movements: assistantPage(movements, page), reservations: assistantPage(reservations, page) };
}

export function readAssistantBl(id: string, page: number) {
  const db = getDb();
  const matches = db.prepare(`SELECT op.id AS operationId, op.delivery_note_id AS noteId,
    op.status, op.stage, op.revision, op.observed_ref AS observedRef, op.last_error AS lastError,
    op.created_at AS createdAt, op.updated_at AS updatedAt, dn.ref, dn.status AS noteStatus
    FROM bl_operations op LEFT JOIN delivery_notes dn ON dn.id = op.delivery_note_id
    WHERE op.id = @id OR op.delivery_note_id = @id OR dn.ref = @id LIMIT 2`).all({ id }) as { operationId: string; noteId: string | null }[];
  if (matches.length !== 1) return { matches, note: "Aucun résultat ou référence ambiguë : fournir un identifiant exact." };
  const operation = matches[0];
  const parcels = db.prepare(`SELECT p.submission_id AS submissionId, p.tracking_number AS trackingNumber,
    p.attached_at AS attachedAt, cs.order_id AS orderId, cs.status, cs.normalized_status AS trackingStatus
    FROM bl_operation_parcels p JOIN courier_submissions cs ON cs.id = p.submission_id
    WHERE p.operation_id = @id ORDER BY p.submission_id LIMIT 21 OFFSET @offset
  `).all({ id: operation.operationId, offset: (page - 1) * 20 });
  const events = db.prepare(`SELECT stage, kind, substr(detail, 1, 600) AS detail, created_at AS createdAt
    FROM bl_operation_events WHERE operation_id = @id ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET @offset
  `).all({ id: operation.operationId, offset: (page - 1) * 20 });
  return { operation, parcels: assistantPage(parcels, page), events: assistantPage(events, page),
    guidance: "Une étape incertaine exige une réconciliation enregistrée du portail. Jamais de relance aveugle ni de reprise automatique d’un bail." };
}

export function readAssistantTracking(input: { orderId?: string; submissionId?: string; page: number }) {
  const db = getDb();
  const parcel = db.prepare(`SELECT id, order_id AS orderId, status, tracking_number AS trackingNumber,
    normalized_status AS currentTrackingStatus, raw_status AS currentRawStatus, last_sync_at AS lastSyncAt,
    updated_at AS updatedAt FROM courier_submissions WHERE ${input.submissionId ? "id" : "order_id"} = ?
    ORDER BY created_at DESC, id DESC LIMIT 1`).get(input.submissionId ?? input.orderId) as { id: string } | undefined;
  if (!parcel) return null;
  const events = db.prepare(`SELECT raw_status AS rawStatus, normalized_status AS normalizedStatus,
    observed_at AS providerObservedAt, created_at AS recordedAt FROM tracking_events
    WHERE submission_id = @id ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET @offset
  `).all({ id: parcel.id, offset: (input.page - 1) * 20 });
  return { parcel, history: assistantPage(events, input.page),
    note: "Historique des observations, y compris observations ignorées car anciennes ou contradictoires. Seul currentTrackingStatus décrit l’état courant enregistré. Aucun appel en direct au transporteur." };
}

export function readAssistantParcels(ids: string[]) {
  const unique = [...new Set(ids)].slice(0, 10);
  if (!unique.length) return { rows: [] };
  const rows = getDb().prepare(`SELECT cs.id AS submissionId, cs.order_id AS orderId,
    cs.status, cs.tracking_number AS trackingNumber, cs.normalized_status AS trackingStatus,
    cs.last_sync_at AS lastSyncAt, cs.last_error AS lastError, o.confirmation_status AS confirmationStatus,
    p.operation_id AS operationId, dn.ref AS blRef
    FROM courier_submissions cs JOIN orders o ON o.id = cs.order_id
    LEFT JOIN bl_operation_parcels p ON p.submission_id = cs.id
    LEFT JOIN bl_operations op ON op.id = p.operation_id
    LEFT JOIN delivery_notes dn ON dn.id = op.delivery_note_id
    WHERE cs.id IN (${unique.map(() => "?").join(",")}) ORDER BY cs.id LIMIT 10`).all(...unique);
  return { rows, requestedCount: unique.length, note: "Seulement les colis demandés, pas un total global. Aucun appel au transporteur." };
}

export function readAssistantParcelFollowups(days: number, page: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString();
  const rows = getDb().prepare(`SELECT cs.id AS submissionId, cs.order_id AS orderId,
    cs.tracking_number AS trackingNumber, cs.normalized_status AS trackingStatus, cs.last_sync_at AS lastSyncAt,
    (SELECT MAX(te.created_at) FROM tracking_events te WHERE te.submission_id = cs.id) AS lastEventRecordedAt
    FROM courier_submissions cs WHERE cs.status = 'submitted'
      AND COALESCE(cs.normalized_status, 'unknown') IN ('in_transit','at_facility','out_for_delivery','unknown')
      AND COALESCE((SELECT MAX(te.created_at) FROM tracking_events te WHERE te.submission_id = cs.id), cs.created_at) < @cutoff
    ORDER BY cs.created_at, cs.id LIMIT 21 OFFSET @offset
  `).all({ cutoff, offset: (page - 1) * 20 });
  return { ...assistantPage(rows, page), cutoff, note: "Aucune nouvelle observation enregistrée depuis cette date. Ce critère ne prouve ni une immobilisation réelle ni une panne du livreur. Vérifier aussi la fraîcheur lastSyncAt." };
}

export function readAssistantReturns(status: "all" | "returning" | "received" | "inspected", page: number) {
  const rows = getDb().prepare(`SELECT r.id, cs.order_id AS orderId, cs.tracking_number AS trackingNumber,
    r.status, r.reason, r.sellable_qty AS sellableQty, r.damaged_qty AS damagedQty,
    r.received_at AS receivedAt, r.inspected_at AS inspectedAt, r.created_at AS createdAt
    FROM returns r JOIN courier_submissions cs ON cs.id = r.submission_id
    ${status === "all" ? "" : "WHERE r.status = @status"}
    ORDER BY r.created_at DESC, r.id DESC LIMIT 21 OFFSET @offset
  `).all({ ...(status === "all" ? {} : { status }), offset: (page - 1) * 20 });
  return assistantPage(rows, page);
}

export function readAssistantTeam(page: number) {
  const db = getDb();
  const rows = db.prepare(`SELECT u.id, u.name, u.role, u.is_active AS active,
    (SELECT COUNT(*) FROM orders o WHERE o.assigned_to = u.id AND o.confirmation_status IN ('new','no_answer','call_back_later')) AS awaitingConfirmation,
    (SELECT COUNT(*) FROM orders o WHERE o.assigned_to = u.id AND o.confirmation_status = 'call_back_later') AS callbacksScheduled
    FROM users u ORDER BY u.is_active DESC, u.name, u.id LIMIT 21 OFFSET @offset
  `).all({ offset: (page - 1) * 20 });
  const unassigned = db.prepare(`SELECT COUNT(*) AS awaitingConfirmation FROM orders
    WHERE assigned_to IS NULL AND confirmation_status IN ('new','no_answer','call_back_later')`).get();
  return { team: assistantPage(rows, page), unassigned, note: "Charge actuelle, pas une mesure de performance individuelle. Les rappels planifiés ne sont pas nécessairement dus aujourd’hui." };
}

export function assistantPeriod(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0, 10) !== startDate || new Date(end).toISOString().slice(0, 10) !== endDate || end < start || end - start > 30 * 86400000) {
    throw new Error("Période invalide : de 1 à 31 jours calendaires.");
  }
  const endExclusive = new Date(end + 86400000).toISOString().slice(0, 10);
  const from = casablancaLocalToUtcIso(`${startDate}T00:00`);
  const to = casablancaLocalToUtcIso(`${endExclusive}T00:00`);
  if (!from || !to) throw new Error("Dates locales invalides.");
  return { startDate, endDate, from, to, days: (end - start) / 86400000 + 1 };
}

export function readAssistantPeriod(startDate: string, endDate: string, comparePrevious: boolean) {
  const period = assistantPeriod(startDate, endDate);
  function summary(range: ReturnType<typeof assistantPeriod>) {
    const counts = getDb().prepare(`SELECT COUNT(*) AS ordersCreated,
      COALESCE(SUM(o.confirmation_status = 'confirmed'), 0) AS currentlyConfirmed,
      COALESCE(SUM(o.confirmation_status = 'cancelled'), 0) AS currentlyCancelled,
      COALESCE(SUM(o.confirmation_status IN ('new','no_answer','call_back_later')), 0) AS currentlyAwaitingConfirmation,
      COALESCE(SUM(cs.normalized_status = 'delivered'), 0) AS currentlyDelivered,
      COALESCE(SUM(cs.normalized_status = 'refused'), 0) AS currentlyRefused,
      COALESCE(SUM(cs.status = 'submitted' AND COALESCE(cs.normalized_status, 'unknown') = 'unknown'), 0) AS submittedWithUnknownTracking
      FROM orders o LEFT JOIN courier_submissions cs ON cs.id = (
        SELECT s.id FROM courier_submissions s WHERE s.order_id = o.id ORDER BY s.created_at DESC, s.id DESC LIMIT 1
      ) WHERE o.created_at >= @from AND o.created_at < @to`).get({ from: range.from, to: range.to });
    return { ...range, counts };
  }
  const previousEnd = new Date(Date.parse(`${startDate}T00:00:00Z`) - 86400000);
  const previousStart = new Date(previousEnd.getTime() - (period.days - 1) * 86400000);
  return { current: summary(period), previous: comparePrevious ? summary(assistantPeriod(previousStart.toISOString().slice(0, 10), previousEnd.toISOString().slice(0, 10))) : null,
    definition: "Cohortes de commandes CRÉÉES pendant chaque période inclusive en Africa/Casablanca. Les confirmations et livraisons sont leurs statuts ACTUELS, pas le nombre d’actions effectuées pendant la période. Aucun montant encaissé n’est calculé." };
}
