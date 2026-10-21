/**
 * Error classes for the inventory service (see ./inventory.ts).
 */

export interface StockShortage {
  variantId: string;
  sku: string;
  requested: number;
  available: number;
}

/**
 * Thrown by reserveForOrder when one or more lines cannot be reserved.
 * Carries the full list of shortages so callers can show a complete
 * fail-fast report instead of only the first failing line.
 */
export class InsufficientStockError extends Error {
  readonly shortages: StockShortage[];

  constructor(shortages: StockShortage[]) {
    super(
      `Stock insuffisant pour ${shortages.length} variante(s) : ${shortages
        .map((s) => `${s.sku} (demandé ${s.requested}, disponible ${s.available})`)
        .join(", ")}`,
    );
    this.name = "InsufficientStockError";
    this.shortages = shortages;
  }
}

/**
 * Thrown when an idempotent movement ref is replayed with a different
 * payload — the event already happened, but not in the shape we expected.
 */
export class InventoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryConflictError";
  }
}

export class InventoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryValidationError";
  }
}
