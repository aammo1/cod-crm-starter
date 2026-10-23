import { randomUUID } from "node:crypto";
import os from "node:os";
import { getDb } from "@/lib/db";

/** Enforces "one process owner per DB" for the background workers. */
export const WORKER_LEASE_KEY = "worker_lease";
export const LEASE_TTL_MS = 90_000;

export interface WorkerLeaseHolder {
  ownerId: string;
  pid: number;
  hostname: string;
  acquiredAt: string;
  heartbeatAt: string;
}

/**
 * Next may bundle this module separately (instrumentation vs route handlers),
 * so the id lives on globalThis to stay identical across module instances.
 */
function processOwnerId(): string {
  const g = globalThis as { __crmWorkerOwnerId?: string };
  return (g.__crmWorkerOwnerId ??= randomUUID());
}

export const PROCESS_OWNER_ID = processOwnerId();

function parse(raw: string | undefined): WorkerLeaseHolder | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<WorkerLeaseHolder>;
    if (typeof v.ownerId !== "string" || typeof v.heartbeatAt !== "string") return null;
    return {
      ownerId: v.ownerId,
      pid: Number(v.pid) || 0,
      hostname: String(v.hostname ?? ""),
      acquiredAt: String(v.acquiredAt ?? v.heartbeatAt),
      heartbeatAt: v.heartbeatAt,
    };
  } catch {
    return null;
  }
}

function readRow(): WorkerLeaseHolder | null {
  const row = getDb().prepare("SELECT value FROM app_state WHERE key = ?").get(WORKER_LEASE_KEY) as
    | { value: string }
    | undefined;
  return parse(row?.value);
}

function writeRow(holder: WorkerLeaseHolder): void {
  getDb()
    .prepare(
      `INSERT INTO app_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(WORKER_LEASE_KEY, JSON.stringify(holder));
}

function isExpired(holder: WorkerLeaseHolder, now: number): boolean {
  const t = Date.parse(holder.heartbeatAt);
  return !Number.isFinite(t) || now - t > LEASE_TTL_MS;
}

/** Acquire when absent, already mine, or expired. Never steals a live lease. */
export function acquireWorkerLease(
  now: number = Date.now(),
  ownerId: string = PROCESS_OWNER_ID,
): { acquired: boolean; holder: WorkerLeaseHolder | null } {
  const tx = getDb().transaction(() => {
    const current = readRow();
    if (current && current.ownerId !== ownerId && !isExpired(current, now)) {
      return { acquired: false, holder: current };
    }
    const iso = new Date(now).toISOString();
    const holder: WorkerLeaseHolder = {
      ownerId,
      pid: process.pid,
      hostname: os.hostname(),
      acquiredAt: current?.ownerId === ownerId ? current.acquiredAt : iso,
      heartbeatAt: iso,
    };
    writeRow(holder);
    return { acquired: true, holder };
  });
  return tx.immediate();
}

/** Returns false when the lease is no longer mine (never writes in that case). */
export function heartbeatWorkerLease(
  now: number = Date.now(),
  ownerId: string = PROCESS_OWNER_ID,
): boolean {
  const tx = getDb().transaction(() => {
    const current = readRow();
    if (!current || current.ownerId !== ownerId) return false;
    writeRow({ ...current, heartbeatAt: new Date(now).toISOString() });
    return true;
  });
  return tx.immediate();
}

export function releaseWorkerLease(ownerId: string = PROCESS_OWNER_ID): void {
  const tx = getDb().transaction(() => {
    const current = readRow();
    if (current && current.ownerId === ownerId) {
      getDb().prepare("DELETE FROM app_state WHERE key = ?").run(WORKER_LEASE_KEY);
    }
  });
  tx.immediate();
}

/** Health view: whether this process owns the lease and who holds it. */
export function workerLeaseStatus(
  now: number = Date.now(),
  ownerId: string = PROCESS_OWNER_ID,
): { owned: boolean; holder: WorkerLeaseHolder | null } {
  const holder = readRow();
  const live = holder && !isExpired(holder, now) ? holder : null;
  return { owned: !!live && live.ownerId === ownerId, holder: live };
}
