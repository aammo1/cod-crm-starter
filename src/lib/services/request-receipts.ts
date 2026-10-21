import type Database from "better-sqlite3";
import type { StorefrontReceiptScope, StorefrontRequestReceipt } from "@/lib/commerce-types";

export class StorefrontOrderError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "StorefrontOrderError";
  }
}

export function validateRequestKey(key: string): void {
  if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw new StorefrontOrderError(400, "INVALID_REQUEST_KEY", "Clé d’idempotence invalide.");
  }
}

/** Caller owns the immediate write transaction; receipts are permanent. */
export function findReceipt(db: Database.Database, scope: StorefrontReceiptScope, key: string, hash: string): StorefrontRequestReceipt | null {
  const row = db.prepare("SELECT * FROM storefront_request_receipts WHERE scope = ? AND request_key = ?")
    .get(scope, key) as StorefrontRequestReceipt | undefined;
  if (row && row.request_hash !== hash) {
    throw new StorefrontOrderError(409, "IDEMPOTENCY_CONFLICT", "Cette clé correspond à une autre demande.");
  }
  return row ?? null;
}

export function writeReceipt(db: Database.Database, scope: StorefrontReceiptScope, key: string, hash: string, orderId: string, response: object): void {
  if (!db.inTransaction) throw new Error("Une transaction est requise.");
  db.prepare(`INSERT INTO storefront_request_receipts
    (scope, request_key, request_hash, order_id, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(scope, key, hash, orderId, JSON.stringify(response), new Date().toISOString());
}

export function immediateOrderTransaction<T>(db: Database.Database, fn: () => T): T {
  try { return db.transaction(fn).immediate(); }
  catch (error) {
    if (error instanceof Error && "code" in error && String(error.code).startsWith("SQLITE_BUSY")) {
      throw new StorefrontOrderError(503, "RETRY_REQUEST", "Service occupé. Réessayez avec la même clé.");
    }
    throw error;
  }
}
