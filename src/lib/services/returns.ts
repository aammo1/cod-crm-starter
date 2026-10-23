import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { closeReturnWithoutUnits as closeInventoryReturn, getDispatchedVariants } from "@/lib/services/inventory";
import { insertContact } from "@/lib/services/orders";

export type ReturnStatus = "returning" | "received" | "inspected";

export interface ReturnRow {
  id: string;
  submissionId: string;
  status: ReturnStatus;
  sellableQty: number;
  damagedQty: number;
  reason: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  inspectedAt: string | null;
  inspectedBy: string | null;
  createdAt: string;
}

interface ReturnsTableRow {
  id: string;
  submission_id: string;
  status: string;
  sellable_qty: number;
  damaged_qty: number;
  reason: string | null;
  received_at: string | null;
  received_by: string | null;
  inspected_at: string | null;
  inspected_by: string | null;
  created_at: string;
}

function mapReturnRow(row: ReturnsTableRow): ReturnRow {
  return {
    id: row.id,
    submissionId: row.submission_id,
    status: row.status as ReturnStatus,
    sellableQty: row.sellable_qty,
    damagedQty: row.damaged_qty,
    reason: row.reason,
    receivedAt: row.received_at,
    receivedBy: row.received_by,
    inspectedAt: row.inspected_at,
    inspectedBy: row.inspected_by,
    createdAt: row.created_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export function getReturn(id: string): ReturnRow | null {
  const row = getDb()
    .prepare("SELECT * FROM returns WHERE id = ?")
    .get(id) as ReturnsTableRow | undefined;
  return row ? mapReturnRow(row) : null;
}

export function getReturnBySubmission(submissionId: string): ReturnRow | null {
  const row = getDb()
    .prepare("SELECT * FROM returns WHERE submission_id = ?")
    .get(submissionId) as ReturnsTableRow | undefined;
  return row ? mapReturnRow(row) : null;
}

/**
 * Idempotent creation of a `returning` row for a submission (tracking poller
 * refused/return signals, or a manual CRM declaration). An existing row is
 * never modified — reason and status are preserved. NEVER restocks: stock
 * changes happen only via physical receipt + inspection (task-16).
 */
export function ensureReturn(submissionId: string, reason?: string): ReturnRow | null {
  const db = getDb();
  const now = nowIso();
  db.prepare(
    `INSERT OR IGNORE INTO returns (id, submission_id, status, sellable_qty, damaged_qty, reason, received_at, inspected_at, created_at)
     VALUES (?, ?, 'returning', 0, 0, ?, NULL, NULL, ?)`,
  ).run(`ret_${nanoid(12)}`, submissionId, reason ?? null, now);
  return getReturnBySubmission(submissionId);
}

/** Manual declarations require actual dispatch, never just a courier label. */
export function declareManualReturn(trackingNumber: string, actorId: string): ReturnRow | null {
  const db = getDb();
  return db.transaction(() => {
    const submission = db.prepare(`SELECT cs.id, cs.order_id FROM courier_submissions cs
      JOIN orders o ON o.id = cs.order_id
      WHERE cs.tracking_number = ? AND cs.status = 'submitted'
        AND o.confirmation_status = 'confirmed'`).get(trackingNumber) as
      { id: string; order_id: string } | undefined;
    if (!submission || getDispatchedVariants(submission.order_id).length === 0) return null;
    const existing = getReturnBySubmission(submission.id);
    if (existing) return existing;
    const result = ensureReturn(submission.id, "Déclaration manuelle CRM");
    insertContact({ orderId: submission.order_id, agentId: actorId, channel: "note", outcome: "note",
      note: `Retour déclaré manuellement — suivi ${trackingNumber}` });
    return result;
  }).immediate();
}

/**
 * Marks a return physically received at the warehouse (used by task-16).
 * Idempotent: `received`/`inspected` rows are never downgraded back.
 */
export function markReturnReceived(id: string, actor: string): ReturnRow | null {
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE returns SET status = 'received', received_at = ?, received_by = ? WHERE id = ? AND status = 'returning'",
    )
    .run(nowIso(), actor, id);
  if (result.changes > 0) {
    console.log(`[returns] retour ${id} marqué « reçu » par ${actor}`);
  }
  return getReturn(id);
}

export type ReturnCloseOutcome = "closed_empty" | "lost";

/**
 * Closes a received return with zero units. Stock is untouched (the inventory
 * service finalizes the row without any movement); the outcome and reason are
 * stored in `reason` as "[outcome] reason".
 */
export function closeReturnWithoutUnits(
  id: string,
  outcome: ReturnCloseOutcome,
  reason: string,
  actor: string,
): ReturnRow {
  const db = getDb();
  return db.transaction(() => {
    const current = getReturn(id);
    if (!current) throw new Error("Retour introuvable.");
    const submission = db.prepare("SELECT order_id FROM courier_submissions WHERE id = ?")
      .get(current.submissionId) as { order_id: string } | undefined;
    if (!submission) throw new Error("Soumission transporteur introuvable.");
    const { alreadyClosed } = closeInventoryReturn(current.submissionId, submission.order_id, actor);
    if (!alreadyClosed) {
      db.prepare("UPDATE returns SET reason = ? WHERE id = ?").run(`[${outcome}] ${reason}`, id);
    }
    return getReturn(id)!;
  }).immediate();
}
