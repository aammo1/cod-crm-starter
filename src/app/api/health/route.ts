import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { SUBMISSION_LAST_TICK_KEY, TRACKING_LAST_TICK_KEY } from "@/lib/services/app-state";
import { workerHealth } from "@/lib/workers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueueCounts {
  submissionsQueued: number;
  submissionsNeedsReview: number;
  submissionsFailed: number;
}

function readQueues(): QueueCounts {
  const row = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0) AS queued,
         COALESCE(SUM(CASE WHEN status = 'needs_review' THEN 1 ELSE 0 END), 0) AS needs_review,
         COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
        FROM courier_submissions cs
        WHERE NOT EXISTS (SELECT 1 FROM orders o
          WHERE o.id = cs.order_id AND o.confirmation_status = 'cancelled')`,
    )
    .get() as { queued: number; needs_review: number; failed: number };
  return {
    submissionsQueued: row.queued,
    submissionsNeedsReview: row.needs_review,
    submissionsFailed: row.failed,
  };
}

function readLastTicks(): Map<string, string> {
  const rows = getDb()
    .prepare("SELECT key, value FROM app_state WHERE key IN (?, ?, ?)")
    .all(SUBMISSION_LAST_TICK_KEY, TRACKING_LAST_TICK_KEY, "meta_last_tick") as Array<{
    key: string;
    value: string;
  }>;
  return new Map(rows.map((row) => [row.key, row.value]));
}

export function GET(): NextResponse {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    const workers = workerHealth();
    const ticks = readLastTicks();
    return NextResponse.json({
      status: "ok",
      db: true,
      workers: {
        submission: {
          enabled: workers.submission.enabled,
          lastTickAt: ticks.get(SUBMISSION_LAST_TICK_KEY) ?? undefined,
        },
        tracking: {
          enabled: workers.tracking.enabled,
          lastTickAt: ticks.get(TRACKING_LAST_TICK_KEY) ?? undefined,
        },
        meta: {
          enabled: workers.meta.enabled,
          lastTickAt: ticks.get("meta_last_tick") ?? undefined,
        },
      },
      queues: readQueues(),
    });
  } catch {
    return NextResponse.json(
      { status: "error", db: false, workers: null, queues: null },
      { status: 503 },
    );
  }
}
