import { getDb } from "@/lib/db";
import { getCrmOrder as getOrder } from "@/lib/services/orders";
import { ProviderError } from "@/lib/shipping/errors";
import { getProvider } from "@/lib/shipping";
import { buildCreateParcelInput } from "@/lib/shipping/parcel-payload";
import { redactText } from "@/lib/shipping/redact";
import { getSubmission, type SubmissionStatus } from "@/lib/services/submissions";
import { SUBMISSION_LAST_TICK_KEY, setAppState } from "@/lib/services/app-state";
import type { DeliveryProvider } from "@/lib/shipping/provider";

const BATCH_SIZE = 5;
const DEFAULT_INTERVAL_SEC = 15;
const MIN_INTERVAL_SEC = 5;

function intervalMs(): number {
  const raw = Number(process.env.OZON_SUBMIT_INTERVAL_SEC);
  const sec = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_SEC;
  return Math.max(sec, MIN_INTERVAL_SEC) * 1000;
}

function nowIso(): string {
  return new Date().toISOString();
}

function setStatus(
  id: string,
  status: SubmissionStatus,
  fields: {
    trackingNumber?: string;
    rawResponseJson?: string | null;
    lastError?: string | null;
  },
): void {
  const now = nowIso();
  getDb()
    .prepare(
      `UPDATE courier_submissions
       SET status = ?, tracking_number = ?, raw_response_json = ?, last_error = ?, next_retry_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      status,
      fields.trackingNumber ?? null,
      fields.rawResponseJson ?? null,
      fields.lastError ?? null,
      now,
      now,
      id,
    );
}

/** Crash mid-flight means the request outcome is unknowable — never re-create. */
function resolveStaleSubmitting(): void {
  const now = nowIso();
  getDb()
    .prepare(
      `UPDATE courier_submissions
       SET status = 'needs_review',
           last_error = COALESCE(last_error, 'Worker interrompu pendant la soumission — vérifier sur le portail Ozon avant toute re-création'),
           updated_at = ?
       WHERE status = 'submitting'`,
    )
    .run(now);
}

async function processOne(provider: DeliveryProvider, id: string): Promise<void> {
  const db = getDb();
  const claimed = db
    .prepare(
      `UPDATE courier_submissions SET status = 'submitting', attempts = attempts + 1, updated_at = ?
       WHERE id = ? AND status = 'queued'`,
    )
    .run(nowIso(), id);
  if (claimed.changes === 0) return;

  const submission = getSubmission(id);
  if (!submission) return;

  const order = getOrder(submission.orderId);
  if (!order) {
    setStatus(id, "failed", { lastError: "Commande introuvable" });
    return;
  }
  if (order.confirmationStatus === "cancelled") {
    setStatus(id, "failed", { lastError: "Commande annulée — pas de création de colis" });
    return;
  }

  try {
    const input = buildCreateParcelInput(submission, order);
    const result = await provider.createParcel(input);
    setStatus(id, "submitted", {
      trackingNumber: result.trackingNumber,
      rawResponseJson: JSON.stringify(result.raw) ?? null,
    });
  } catch (err) {
    if (err instanceof ProviderError && err.kind === "permanent") {
      setStatus(id, "failed", { lastError: redactText(err.message) });
      return;
    }
    setStatus(id, "needs_review", {
      lastError: redactText(
        err instanceof ProviderError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err),
      ),
    });
  }
}

/**
 * Processes due queued submissions. Serialized per process: a tick that fires
 * while the previous drain is still running (slow courier call) is skipped, so
 * two drains never race over the same batch.
 */
export async function drainSubmissions(provider: DeliveryProvider): Promise<void> {
  const g = globalThis as { __zehriSubmissionDraining?: boolean };
  if (g.__zehriSubmissionDraining) return;
  g.__zehriSubmissionDraining = true;
  try {
    await drain(provider);
  } finally {
    g.__zehriSubmissionDraining = false;
  }
}

async function drain(provider: DeliveryProvider): Promise<void> {
  const due = getDb()
    .prepare(
      `SELECT id FROM courier_submissions
       WHERE status = 'queued' AND next_retry_at <= ?
       ORDER BY next_retry_at ASC LIMIT ${BATCH_SIZE}`,
    )
    .all(nowIso()) as Array<{ id: string }>;
  for (const job of due) {
    await processOne(provider, job.id);
  }
}

/** /api/health liveness signal — a failed write must never break the tick. */
function heartbeat(): void {
  try {
    setAppState(SUBMISSION_LAST_TICK_KEY, new Date().toISOString());
  } catch {
    // Health signal only.
  }
}

export function startSubmissionWorker(): void {
  const g = globalThis as { __zehriSubmissionWorker?: NodeJS.Timeout };
  if (g.__zehriSubmissionWorker) return;

  if (process.env.DELIVERY_PROVIDER === "mock") {
    console.log("[submission] MOCK provider actif — aucun appel réel à Ozon");
  }

  resolveStaleSubmitting();
  const provider = getProvider();
  const tick = () => {
    heartbeat();
    drainSubmissions(provider).catch((err: unknown) => {
      console.error(
        `[submission] tick en échec : ${redactText(err instanceof Error ? err.message : String(err))}`,
      );
    });
  };
  void tick();
  g.__zehriSubmissionWorker = setInterval(tick, intervalMs());
}
