import { nanoid } from "nanoid";
import { getDb, type OrderItem } from "@/lib/db";
import {
  InsufficientStockError,
  InventoryConflictError,
  InventoryValidationError,
  type StockShortage,
} from "./inventory-errors";
import { stockBatchSchema, type StockBatchInput } from "./inventory-schemas";
import { getAppState, setAppState } from "./app-state";

export type { StockShortage };
export { InsufficientStockError, InventoryConflictError, InventoryValidationError };

export type MovementKind =
  | "opening"
  | "reserve"
  | "release"
  | "dispatch"
  | "receive_sellable"
  | "receive_quarantine"
  | "adjust_physical"
  | "adjust_quarantine";

export interface MovementRow {
  id: string;
  variant_id: string;
  location: string;
  kind: MovementKind;
  qty: number;
  reason: string | null;
  order_id: string | null;
  submission_id: string | null;
  actor: string;
  source: string;
  ref: string;
  created_at: string;
}

// Raw row as SQLite returns it (`kind` is plain TEXT, constrained by a CHECK).
type MovementRecord = Omit<MovementRow, "kind"> & { kind: string };

export interface VariantBalance {
  physical: number;
  reserved: number;
  quarantine: number;
  available: number;
}

export interface ReserveLine {
  variantId: string;
  qty: number;
}

export interface LowStockRow {
  variantId: string;
  sku: string;
  product: string;
  available: number;
}

export interface MovementFilter {
  variantId?: string;
  orderId?: string;
  limit?: number;
}

export interface AdjustChange {
  physicalDelta?: number;
  quarantineDelta?: number;
}

export const DEFAULT_LOCATION = "ZEHRI";

interface BalanceRow {
  physical: number;
  reserved: number;
  quarantine: number;
}

interface ReservationRow {
  id: string;
  variant_id: string;
  qty: number;
}

interface MovementInsert {
  id: string;
  variantId: string;
  location: string;
  kind: MovementKind;
  qty: number;
  reason: string | null;
  orderId: string | null;
  submissionId: string | null;
  actor: string;
  source: string;
  ref: string;
  createdAt: string;
}

interface ProductBalanceRecord {
  variant_id: string;
  physical: number;
  reserved: number;
  quarantine: number;
}

type LowStockRecord = ProductBalanceRecord & {
  sku: string;
  product_id: string;
};

// Prepared once per process, on first use — importing this module (e.g. during
// `next build` page-data collection) must never open the database (see db.ts).
let statementsCache: ReturnType<typeof buildStatements> | null = null;

function stmts() {
  if (!statementsCache) statementsCache = buildStatements();
  return statementsCache;
}

function buildStatements() {
  const db = getDb();
  return {
    selectBalance: db.prepare<{ variantId: string; location: string }, BalanceRow>(
      `SELECT physical, reserved, quarantine
       FROM stock_balances
       WHERE variant_id = @variantId AND location = @location`,
    ),
    insertZeroBalance: db.prepare<{ variantId: string; location: string }>(
      `INSERT INTO stock_balances (variant_id, location, physical, reserved, quarantine)
       VALUES (@variantId, @location, 0, 0, 0)`,
    ),
    updateBalance: db.prepare<
      { variantId: string; location: string } & BalanceRow
    >(`UPDATE stock_balances
       SET physical = @physical, reserved = @reserved, quarantine = @quarantine
       WHERE variant_id = @variantId AND location = @location`),
    insertMovement: db.prepare<MovementInsert>(
      `INSERT INTO stock_movements
         (id, variant_id, location, kind, qty, reason, order_id, submission_id, actor, source, ref, created_at)
       VALUES
         (@id, @variantId, @location, @kind, @qty, @reason, @orderId, @submissionId, @actor, @source, @ref, @createdAt)`,
    ),
    selectMovementByRef: db.prepare<{ ref: string }, MovementRecord>(
      "SELECT * FROM stock_movements WHERE ref = @ref",
    ),
    // Any prior handoff or recovery observation for an order (refs all start
    // with "disp") — used so neither path can double-debit the other's work.
    selectDispatchMovementsByOrder: db.prepare<{ orderId: string }, MovementRecord>(
      `SELECT * FROM stock_movements
       WHERE order_id = @orderId AND (kind = 'dispatch' OR ref LIKE 'disp%')`,
    ),
    selectOrderKindMovements: db.prepare<{ orderId: string; kind: string }, MovementRecord>(
      "SELECT * FROM stock_movements WHERE order_id = @orderId AND kind = @kind",
    ),
    selectActiveReservations: db.prepare<{ orderId: string }, ReservationRow>(
      `SELECT id, variant_id, qty FROM reservations
       WHERE order_id = @orderId AND status = 'active'`,
    ),
    insertReservation: db.prepare<{
      id: string;
      orderId: string;
      variantId: string;
      qty: number;
      createdAt: string;
    }>(`INSERT INTO reservations (id, order_id, variant_id, qty, status, created_at)
        VALUES (@id, @orderId, @variantId, @qty, 'active', @createdAt)`),
    setReservationStatus: db.prepare<{ id: string; status: string; now: string }>(
      "UPDATE reservations SET status = @status, resolved_at = @now WHERE id = @id",
    ),
    selectVariantSku: db.prepare<{ variantId: string }, { sku: string; product_id: string }>(
      "SELECT sku, product_id FROM variants WHERE id = @variantId",
    ),
    selectLowStock: db.prepare<{ location: string }, LowStockRecord>(
      // Active variants of active products only; a variant with no balance row
      // at this location is genuinely out of stock (all zeros).
      `SELECT v.id AS variant_id, v.sku, v.product_id,
              COALESCE(b.physical, 0) AS physical,
              COALESCE(b.reserved, 0) AS reserved,
              COALESCE(b.quarantine, 0) AS quarantine
       FROM variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN stock_balances b ON b.variant_id = v.id AND b.location = @location
       WHERE v.active = 1 AND p.active = 1`,
    ),
    selectReturnsBySubmission: db.prepare<{ submissionId: string }, { id: string; status: string; order_id: string }>(
      `SELECT r.id, r.status, cs.order_id FROM returns r
       JOIN courier_submissions cs ON cs.id = r.submission_id
       WHERE r.submission_id = @submissionId`,
    ),
    updateReturnInspected: db.prepare<{
      id: string;
      sellableQty: number;
      damagedQty: number;
      actor: string;
      now: string;
    }>(`UPDATE returns
        SET status = 'inspected', sellable_qty = @sellableQty, damaged_qty = @damagedQty, inspected_at = @now,
            inspected_by = @actor
        WHERE id = @id`),
    selectReservationsByOrder: db.prepare<{ orderId: string }, ReservationRow>(
      "SELECT id, variant_id, qty FROM reservations WHERE order_id = @orderId AND status = 'consumed'",
    ),
    selectVariantForLine: db.prepare<
      { productId: string; color: string; size: string },
      { id: string }
    >(`SELECT v.id FROM variants v
       JOIN product_colors c ON c.id = v.color_id
       WHERE v.product_id = @productId AND c.name = @color AND v.size = @size
       LIMIT 1`),
    upsertReturnLine: db.prepare<{
      returnId: string;
      variantId: string;
      dispatched: number;
      sellable: number;
      damaged: number;
      now: string;
    }>(`INSERT OR IGNORE INTO return_lines
        (return_id, variant_id, dispatched_qty, sellable_qty, damaged_qty, created_at)
       VALUES (@returnId, @variantId, @dispatched, @sellable, @damaged, @now)`),
  };
}

// Dynamic IN(...) list for balancesByProduct — one prepared statement per
// distinct placeholder count, cached for reuse.
const balancesByProductsCache = new Map<number, ReturnType<typeof buildBalancesByProductsStatement>>();

function buildBalancesByProductsStatement(productCount: number) {
  const placeholders = Array.from({ length: productCount }, () => "?").join(",");
  return getDb().prepare<[...string[], string], ProductBalanceRecord>(
    `SELECT b.variant_id, b.physical, b.reserved, b.quarantine
     FROM stock_balances b
     JOIN variants v ON v.id = b.variant_id
     WHERE v.product_id IN (${placeholders}) AND b.location = ?`,
  );
}

function balancesByProductsStatement(productIds: string[]) {
  let statement = balancesByProductsCache.get(productIds.length);
  if (!statement) {
    statement = buildBalancesByProductsStatement(productIds.length);
    balancesByProductsCache.set(productIds.length, statement);
  }
  return statement;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newMovementId(): string {
  return `mv_${nanoid(24)}`;
}

function newReservationId(): string {
  return `rsv_${nanoid(24)}`;
}

// BEGIN IMMEDIATE so the idempotency pre-checks below cannot race with another
// process writing the same refs between read and write (WAL + busy_timeout).
function withTransaction(fn: () => void): void {
  getDb().transaction(fn).immediate();
}

function availableOf(row: BalanceRow): number {
  // Availability is derived, never stored; clamped so it can never go negative.
  return Math.max(0, row.physical - row.quarantine - row.reserved);
}

function getOrCreateBalance(variantId: string, location: string): BalanceRow {
  const s = stmts();
  const row = s.selectBalance.get({ variantId, location });
  if (row) return row;
  s.insertZeroBalance.run({ variantId, location });
  const created = s.selectBalance.get({ variantId, location });
  if (!created) {
    throw new Error(`inventory: balance introuvable après création (${variantId}@${location})`);
  }
  return created;
}

function writeBalance(variantId: string, location: string, row: BalanceRow): void {
  stmts().updateBalance.run({ variantId, location, ...row });
}

function insertMovement(params: Omit<MovementInsert, "id" | "createdAt">, now: string): void {
  stmts().insertMovement.run({ id: newMovementId(), createdAt: now, ...params });
}

// Replay guard: the existing movement for `ref` must match every expected
// field, otherwise the same ref was reused for a different event.
function assertPayloadMatch(
  existing: MovementRecord,
  ref: string,
  expected: Partial<Pick<MovementRecord, "variant_id" | "location" | "kind" | "qty" | "order_id" | "submission_id">>,
): void {
  const mismatches = Object.entries(expected).filter(
    ([key, value]) => existing[key as keyof MovementRecord] !== value,
  );
  if (mismatches.length > 0) {
    throw new InventoryConflictError(
      `Mouvement ${ref} déjà enregistré avec un payload différent`,
    );
  }
}

function skuOf(variantId: string): string {
  return stmts().selectVariantSku.get({ variantId })?.sku ?? variantId;
}

export function availableFor(variantId: string, location: string = DEFAULT_LOCATION): number {
  const row = stmts().selectBalance.get({ variantId, location });
  if (!row) return 0;
  return availableOf(row);
}

export function balancesByProduct(
  productIds: string[],
): Map<string, VariantBalance> {
  const map = new Map<string, VariantBalance>();
  if (productIds.length === 0) return map;
  const rows = balancesByProductsStatement(productIds).all(...productIds, DEFAULT_LOCATION);
  for (const r of rows) {
    map.set(r.variant_id, {
      physical: r.physical,
      reserved: r.reserved,
      quarantine: r.quarantine,
      available: availableOf(r),
    });
  }
  return map;
}

export function openStock(
  variantId: string,
  qty: number,
  actor: string,
  opts?: { location?: string; source?: string },
): void {
  if (!Number.isSafeInteger(qty) || qty < 0) {
    throw new Error("openStock: qty doit être un entier >= 0");
  }
  const location = opts?.location ?? DEFAULT_LOCATION;
  const ref = `open:${variantId}:${location}`;
  withTransaction(() => {
    const s = stmts();
    const existing = s.selectMovementByRef.get({ ref });
    if (existing) {
      assertPayloadMatch(existing, ref, {
        variant_id: variantId,
        location,
        kind: "opening",
        qty,
      });
      return; // Exact replay — opening already counted.
    }
    const balance = getOrCreateBalance(variantId, location);
    balance.physical += qty;
    writeBalance(variantId, location, balance);
    insertMovement(
      {
        variantId,
        location,
        kind: "opening",
        qty,
        reason: "Ouverture de stock",
        orderId: null,
        submissionId: null,
        actor,
        source: opts?.source ?? "seed",
        ref,
      },
      nowIso(),
    );
  });
}

/** Catalog variants may exist without an opening count. Only inventory writes balances. */
export function ensureStockBalance(variantId: string): void {
  withTransaction(() => { getOrCreateBalance(variantId, DEFAULT_LOCATION); });
}

export interface StockBatchResult {
  ok: true;
  requestId: string;
  mode: StockBatchInput["mode"];
  updated: number;
  items: Array<VariantBalance & { variantId: string }>;
}

/** The durable receipt includes zero-delta counts, and is checked before live stock. */
export function applyStockBatch(input: StockBatchInput, actor: string): StockBatchResult {
  const validated = stockBatchSchema.safeParse(input);
  if (!validated.success) throw new InventoryValidationError("Requête de stock invalide : vérifiez les quantités, le motif et le stock attendu.");
  const parsed = validated.data;
  parsed.items.sort((a, b) => a.variantId.localeCompare(b.variantId));
  const payload = JSON.stringify(parsed);
  const key = `inventory-batch:${parsed.requestId}`;
  return getDb().transaction((): StockBatchResult => {
    const receipt = getAppState(key);
    if (receipt) {
      const saved = JSON.parse(receipt) as { payload: string; result: StockBatchResult };
      if (saved.payload !== payload) throw new InventoryConflictError("Cet identifiant de requête a déjà été utilisé avec un contenu différent.");
      return saved.result;
    }
    const s = stmts();
    const items: StockBatchResult["items"] = [];
    const now = nowIso();
    for (const item of parsed.items) {
      if (!s.selectVariantSku.get({ variantId: item.variantId })) {
        throw new InventoryValidationError(`Variante introuvable : ${item.variantId}`);
      }
      const balance = getOrCreateBalance(item.variantId, DEFAULT_LOCATION);
      if (parsed.mode === "opening") {
        const prior = getDb().prepare("SELECT 1 FROM stock_movements WHERE variant_id = ? AND location = ? LIMIT 1")
          .get(item.variantId, DEFAULT_LOCATION);
        if (prior || balance.physical !== 0 || balance.reserved !== 0 || balance.quarantine !== 0) {
          throw new InventoryConflictError(`Le stock de la variante ${item.variantId} est déjà ouvert ou mouvementé.`);
        }
      }
      if (parsed.mode === "count") {
        const expected = item.expected!; // Required by the schema.
        if (balance.physical !== expected.physical || balance.reserved !== expected.reserved || balance.quarantine !== expected.quarantine) {
          throw new InventoryConflictError(`Le stock de la variante ${item.variantId} a changé. Actualisez avant de corriger.`);
        }
      }
      const physical = parsed.mode === "receive" ? balance.physical + item.qty : item.qty;
      if (!Number.isSafeInteger(physical)) throw new InventoryValidationError("Le stock physique dépasse la quantité maximale autorisée.");
      if (physical < balance.reserved + balance.quarantine) {
        throw new InventoryConflictError(`Le stock physique de la variante ${item.variantId} ne peut pas être inférieur au réservé + quarantaine.`);
      }
      const delta = physical - balance.physical;
      balance.physical = physical;
      writeBalance(item.variantId, DEFAULT_LOCATION, balance);
      insertMovement({
        variantId: item.variantId,
        location: DEFAULT_LOCATION,
        kind: parsed.mode === "opening" ? "opening" : parsed.mode === "receive" ? "receive_sellable" : "adjust_physical",
        qty: delta,
        reason: parsed.reason ?? (parsed.mode === "opening" ? "Ouverture de stock" : "Réception de stock"),
        orderId: null,
        submissionId: null,
        actor,
        source: "crm-stock",
        ref: parsed.mode === "opening" ? `open:${item.variantId}:${DEFAULT_LOCATION}` : `batch:${JSON.stringify([parsed.requestId, item.variantId])}`,
      }, now);
      items.push({ variantId: item.variantId, ...balance, available: availableOf(balance) });
    }
    const result: StockBatchResult = { ok: true, requestId: parsed.requestId, mode: parsed.mode, updated: items.length, items };
    setAppState(key, JSON.stringify({ payload, result }));
    return result;
  }).immediate();
}

export function reserveForOrder(
  orderId: string,
  lines: ReserveLine[],
  actor: string,
  source: string,
): void {
  if (lines.length === 0) return;
  withTransaction(() => {
    const s = stmts();

    // Validate + per-line idempotency pre-check. Lines whose reserve movement
    // already exists with the same payload are skipped (exact replay = no-op).
    const pending = new Map<string, number>();
    const totals = new Map<string, number>();
    for (const line of lines) {
      if (!Number.isInteger(line.qty) || line.qty <= 0) {
        throw new Error(`reserveForOrder: quantité invalide pour ${line.variantId}`);
      }
      totals.set(line.variantId, (totals.get(line.variantId) ?? 0) + line.qty);
    }
    for (const [variantId, qty] of totals) {
      const ref = `res:${orderId}:${variantId}`;
      const existing = s.selectMovementByRef.get({ ref });
      if (existing) {
        assertPayloadMatch(existing, ref, {
          variant_id: variantId,
          order_id: orderId,
          kind: "reserve",
          qty,
        });
        continue;
      }
      pending.set(variantId, qty);
    }
    if (pending.size === 0) return;

    // Fail-fast: check availability for ALL lines before touching anything.
    const balances = new Map<string, BalanceRow>();
    const shortages: StockShortage[] = [];
    for (const [variantId, qty] of pending) {
      const balance = getOrCreateBalance(variantId, DEFAULT_LOCATION);
      balances.set(variantId, balance);
      const available = availableOf(balance);
      if (available < qty) {
        shortages.push({
          variantId,
          sku: skuOf(variantId),
          requested: qty,
          available,
        });
      }
    }
    if (shortages.length > 0) throw new InsufficientStockError(shortages);

    const now = nowIso();
    for (const [variantId, qty] of pending) {
      const balance = balances.get(variantId);
      if (!balance) throw new Error("inventory: balance manquante lors de la réservation");
      balance.reserved += qty;
      writeBalance(variantId, DEFAULT_LOCATION, balance);
      s.insertReservation.run({
        id: newReservationId(),
        orderId,
        variantId,
        qty,
        createdAt: now,
      });
      insertMovement(
        {
          variantId,
          location: DEFAULT_LOCATION,
          kind: "reserve",
          qty,
          reason: `Réservation commande ${orderId}`,
          orderId,
          submissionId: null,
          actor,
          source,
          ref: `res:${orderId}:${variantId}`,
        },
        now,
      );
    }
  });
}

export function releaseForOrder(
  orderId: string,
  actor: string,
  reason: string,
): void {
  withTransaction(() => {
    const s = stmts();
    const active = s.selectActiveReservations.all({ orderId });
    const now = nowIso();
    let applied = 0;
    for (const r of active) {
      const ref = `rel:${orderId}:${r.variant_id}`;
      const existing = s.selectMovementByRef.get({ ref });
      if (existing) {
        assertPayloadMatch(existing, ref, {
          variant_id: r.variant_id,
          order_id: orderId,
          kind: "release",
          qty: -r.qty,
        });
        continue;
      }
      const balance = getOrCreateBalance(r.variant_id, DEFAULT_LOCATION);
      balance.reserved -= r.qty;
      writeBalance(r.variant_id, DEFAULT_LOCATION, balance);
      s.setReservationStatus.run({ id: r.id, status: "released", now });
      insertMovement(
        {
          variantId: r.variant_id,
          location: DEFAULT_LOCATION,
          kind: "release",
          qty: -r.qty,
          reason,
          orderId,
          submissionId: null,
          actor,
          source: "crm-stock",
          ref,
        },
        now,
      );
      applied += 1;
    }
    if (applied === 0 && active.length === 0) {
      const priorReleases = s.selectOrderKindMovements.all({ orderId, kind: "release" });
      if (priorReleases.length === 0) {
        throw new Error(`releaseForOrder: aucune réservation active pour ${orderId}`);
      }
    }
  });
}

// One movement per affected variant (UNIQUE ref per event): `disp:<orderId>:<variantId>`
// or `disp-recovered:<orderId>:<variantId>`. The order-wide guard below makes
// handoff and recovery mutually idempotent: whichever runs first wins.
function applyDispatch(
  orderId: string,
  refPrefix: string,
  actor: string,
  source: string,
): void {
  withTransaction(() => {
    const s = stmts();
    // Neither path may double-debit: any disp:* / disp-recovered:* movement
    // for this order means the handoff was already recorded.
    const priorDispatch = s.selectDispatchMovementsByOrder.all({ orderId });
    if (priorDispatch.length > 0) return;

    const active = s.selectActiveReservations.all({ orderId });
    if (active.length === 0) {
      throw new Error(`dispatch: aucune réservation active pour ${orderId}`);
    }

    const now = nowIso();
    for (const r of active) {
      const balance = getOrCreateBalance(r.variant_id, DEFAULT_LOCATION);
      // physical -= qty AND reserved -= qty → available unchanged.
      balance.physical -= r.qty;
      balance.reserved -= r.qty;
      writeBalance(r.variant_id, DEFAULT_LOCATION, balance);
      s.setReservationStatus.run({ id: r.id, status: "consumed", now });
      insertMovement(
        {
          variantId: r.variant_id,
          location: DEFAULT_LOCATION,
          kind: "dispatch",
          qty: -r.qty,
          reason: `Remise au livreur — commande ${orderId}`,
          orderId,
          submissionId: null,
          actor,
          source,
          ref: `${refPrefix}:${orderId}:${r.variant_id}`,
        },
        now,
      );
    }
  });
}

export function dispatchOrder(orderId: string, actor: string): void {
  applyDispatch(orderId, "disp", actor, "crm-stock");
}

export function recoverDispatch(orderId: string, actor: string): void {
  applyDispatch(orderId, "disp-recovered", actor, "tracking-poller");
}

export interface ReturnLineInput {
  variantId: string;
  sellableQty: number;
  damagedQty: number;
}

export interface DispatchedVariant {
  variantId: string;
  qty: number;
}

/**
 * Single source of truth for "which variants (and how many pairs) left the
 * warehouse for this order". Dispatch movements are authoritative; consumed
 * reservations are only a legacy fallback for orders without a movement.
 * Active/released reservations never prove that a pair left the warehouse.
 */
export function getDispatchedVariants(orderId: string): DispatchedVariant[] {
  const s = stmts();
  const totals = new Map<string, number>();
  for (const m of s.selectDispatchMovementsByOrder.all({ orderId })) {
    totals.set(m.variant_id, (totals.get(m.variant_id) ?? 0) - m.qty);
  }
  if (totals.size === 0) {
    for (const r of s.selectReservationsByOrder.all({ orderId })) {
      totals.set(r.variant_id, (totals.get(r.variant_id) ?? 0) + r.qty);
    }
  }
  return [...totals.entries()]
    .filter(([, qty]) => qty > 0)
    .map(([variantId, qty]) => ({ variantId, qty }));
}

/**
 * A confirmed order line resolves to at most one variant: (product, color,
 * size) is unique in the catalog. No `active` filter — the dispatched variant
 * may have been deactivated since confirmation.
 */
export function resolveVariantForLine(item: OrderItem): string | null {
  const row = stmts().selectVariantForLine.get({
    productId: item.product_id,
    color: item.color,
    size: item.size,
  });
  return row?.id ?? null;
}

/**
 * Restocks/quarantines a return per dispatched variant and records the
 * per-variant result. One movement per (event, variant) with a stable ref
 * (`ret-sell|ret-dmg:<ref>:<variantId>`), so an exact replay is a no-op and a
 * mismatching replay is rejected. Quantities are bounded by what was actually
 * dispatched for each variant. Inspection finalizes the return in one step:
 * variants not listed are treated as not returned.
 */
export function receiveReturnLines(
  submissionId: string,
  orderId: string,
  lines: ReturnLineInput[],
  actor: string,
  ref: string,
): void {
  const merged = new Map<string, { sellable: number; damaged: number }>();
  for (const line of lines) {
    if (
      !Number.isInteger(line.sellableQty) || line.sellableQty < 0 ||
      !Number.isInteger(line.damagedQty) || line.damagedQty < 0
    ) {
      throw new Error("receiveReturn: quantités invalides");
    }
    const entry = merged.get(line.variantId) ?? { sellable: 0, damaged: 0 };
    entry.sellable += line.sellableQty;
    entry.damaged += line.damagedQty;
    merged.set(line.variantId, entry);
  }
  const effective = [...merged.entries()].filter(
    ([, q]) => q.sellable + q.damaged > 0,
  );
  if (effective.length === 0) return;

  withTransaction(() => {
    const s = stmts();
    const returnsRow = s.selectReturnsBySubmission.get({ submissionId });
    if (!returnsRow || returnsRow.order_id !== orderId || returnsRow.status === "returning") {
      throw new InventoryConflictError("receiveReturn: retour introuvable ou colis non reçu pour cette commande");
    }
    if (returnsRow.status === "inspected") {
      const saved = getDb().prepare(`SELECT variant_id, sellable_qty, damaged_qty
        FROM return_lines WHERE return_id = ?`).all(returnsRow.id) as
        Array<{ variant_id: string; sellable_qty: number; damaged_qty: number }>;
      if (saved.length !== effective.length || saved.some((line) => {
        const requested = merged.get(line.variant_id);
        return !requested || requested.sellable !== line.sellable_qty || requested.damaged !== line.damaged_qty;
      })) {
        throw new InventoryConflictError("receiveReturn: retour déjà inspecté avec des quantités différentes");
      }
      return; // The entire inspection, including omitted variants, is immutable.
    }
    const dispatched = new Map(
      getDispatchedVariants(orderId).map((d) => [d.variantId, d.qty]),
    );
    for (const [variantId, q] of effective) {
      const max = dispatched.get(variantId);
      if (max === undefined) {
        throw new InventoryConflictError(
          `receiveReturn: la variante ${variantId} n'a pas été expédiée pour la commande ${orderId}`,
        );
      }
      if (q.sellable + q.damaged > max) {
        throw new InventoryConflictError(
          `receiveReturn: quantité retournée supérieure aux ${max} paire(s) expédiée(s) pour la variante ${variantId}`,
        );
      }
    }

    const location = DEFAULT_LOCATION;
    const now = nowIso();
    for (const [variantId, q] of effective) {
      const sellableRef = `ret-sell:${ref}:${variantId}`;
      const damagedRef = `ret-dmg:${ref}:${variantId}`;
      const sellableExisting = q.sellable > 0 ? s.selectMovementByRef.get({ ref: sellableRef }) : undefined;
      const damagedExisting = q.damaged > 0 ? s.selectMovementByRef.get({ ref: damagedRef }) : undefined;
      if (sellableExisting) {
        assertPayloadMatch(sellableExisting, sellableRef, {
          variant_id: variantId,
          order_id: orderId,
          submission_id: submissionId,
          kind: "receive_sellable",
          qty: q.sellable,
        });
      }
      if (damagedExisting) {
        assertPayloadMatch(damagedExisting, damagedRef, {
          variant_id: variantId,
          order_id: orderId,
          submission_id: submissionId,
          kind: "receive_quarantine",
          qty: q.damaged,
        });
      }
      const applySellable = q.sellable > 0 && !sellableExisting;
      const applyDamaged = q.damaged > 0 && !damagedExisting;
      if (!applySellable && !applyDamaged) continue; // Exact replay for this variant.

      const balance = getOrCreateBalance(variantId, location);
      if (applySellable) balance.physical += q.sellable;
      if (applyDamaged) {
        balance.physical += q.damaged;
        balance.quarantine += q.damaged;
      }
      writeBalance(variantId, location, balance);

      if (applySellable) {
        insertMovement(
          {
            variantId,
            location,
            kind: "receive_sellable",
            qty: q.sellable,
            reason: `Retour vendable — commande ${orderId}`,
            orderId,
            submissionId,
            actor,
            source: "tracking-poller",
            ref: sellableRef,
          },
          now,
        );
      }
      if (applyDamaged) {
        insertMovement(
          {
            variantId,
            location,
            kind: "receive_quarantine",
            qty: q.damaged,
            reason: `Retour endommagé — commande ${orderId}`,
            orderId,
            submissionId,
            actor,
            source: "tracking-poller",
            ref: damagedRef,
          },
          now,
        );
      }
    }

    // Update the returns row if one exists; never create returns rows here.
    if (returnsRow) {
      let sellableTotal = 0;
      let damagedTotal = 0;
      for (const [variantId, q] of effective) {
        sellableTotal += q.sellable;
        damagedTotal += q.damaged;
        s.upsertReturnLine.run({
          returnId: returnsRow.id,
          variantId,
          dispatched: dispatched.get(variantId) ?? 0,
          sellable: q.sellable,
          damaged: q.damaged,
          now,
        });
      }
      s.updateReturnInspected.run({
        id: returnsRow.id,
        sellableQty: sellableTotal,
        damagedQty: damagedTotal,
        actor,
        now,
      });
    }
  });
}

export function adjustStock(
  variantId: string,
  change: AdjustChange,
  reason: string,
  actor: string,
  ref: string,
): void {
  const physicalDelta = change.physicalDelta ?? 0;
  const quarantineDelta = change.quarantineDelta ?? 0;
  if (
    !Number.isInteger(physicalDelta) || !Number.isInteger(quarantineDelta) ||
    (physicalDelta === 0 && quarantineDelta === 0)
  ) {
    throw new Error("adjustStock: deltas invalides");
  }

  withTransaction(() => {
    const s = stmts();
    const location = DEFAULT_LOCATION;

    const physExisting = s.selectMovementByRef.get({ ref });
    const quarExisting = s.selectMovementByRef.get({ ref: `${ref}-q` });
    // Both deltas form one atomic request. A replay cannot add/remove a side
    // of the original adjustment, even if that side originally had zero delta.
    if ((physExisting || quarExisting) &&
        (Boolean(physExisting) !== (physicalDelta !== 0) ||
         Boolean(quarExisting) !== (quarantineDelta !== 0))) {
      throw new InventoryConflictError("Ajustement déjà enregistré avec des deltas différents");
    }
    if (physExisting) {
      assertPayloadMatch(physExisting, ref, {
        variant_id: variantId,
        location,
        kind: "adjust_physical",
        qty: physicalDelta,
      });
    }
    if (quarExisting) {
      assertPayloadMatch(quarExisting, `${ref}-q`, {
        variant_id: variantId,
        location,
        kind: "adjust_quarantine",
        qty: quarantineDelta,
      });
    }
    const applyPhysical = physicalDelta !== 0 && !physExisting;
    const applyQuarantine = quarantineDelta !== 0 && !quarExisting;
    if (!applyPhysical && !applyQuarantine) return; // Exact replay — no-op.

    const balance = getOrCreateBalance(variantId, location);
    const newPhysical = applyPhysical ? balance.physical + physicalDelta : balance.physical;
    const newQuarantine = applyQuarantine ? balance.quarantine + quarantineDelta : balance.quarantine;
    if (newPhysical < 0) {
      throw new Error("adjustStock: le physique ne peut pas devenir négatif");
    }
    if (newQuarantine < 0 || newQuarantine > newPhysical) {
      throw new Error("adjustStock: quarantaine invalide (doit être dans [0, physique])");
    }
    // Keep availability non-negative: physical cannot drop below what is
    // already reserved/quarantined — release or adjust quarantine first.
    if (newPhysical - newQuarantine - balance.reserved < 0) {
      throw new Error("adjustStock: le physique ne peut pas passer sous réservé + quarantaine");
    }

    balance.physical = newPhysical;
    balance.quarantine = newQuarantine;
    writeBalance(variantId, location, balance);

    const now = nowIso();
    if (applyPhysical) {
      insertMovement(
        {
          variantId,
          location,
          kind: "adjust_physical",
          qty: physicalDelta,
          reason,
          orderId: null,
          submissionId: null,
          actor,
          source: "crm-stock",
          ref,
        },
        now,
      );
    }
    if (applyQuarantine) {
      insertMovement(
        {
          variantId,
          location,
          kind: "adjust_quarantine",
          qty: quarantineDelta,
          reason,
          orderId: null,
          submissionId: null,
          actor,
          source: "crm-stock",
          ref: `${ref}-q`,
        },
        now,
      );
    }
  });
}

export function lowStock(threshold: number): LowStockRow[] {
  const rows = stmts().selectLowStock.all({ location: DEFAULT_LOCATION });
  const result: LowStockRow[] = [];
  for (const r of rows) {
    const available = availableOf(r);
    if (available <= threshold) {
      result.push({
        variantId: r.variant_id,
        sku: r.sku,
        product: r.product_id,
        available,
      });
    }
  }
  return result;
}

export function listMovements(filter?: MovementFilter): MovementRow[] {
  const clauses: string[] = [];
  const params: { variantId?: string; orderId?: string; limit: number } = {
    limit: filter?.limit ?? 100,
  };
  if (filter?.variantId) {
    clauses.push("variant_id = @variantId");
    params.variantId = filter.variantId;
  }
  if (filter?.orderId) {
    clauses.push("order_id = @orderId");
    params.orderId = filter.orderId;
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare<{ variantId?: string; orderId?: string; limit: number }, MovementRecord>(
      `SELECT * FROM stock_movements ${where} ORDER BY created_at DESC, id DESC LIMIT @limit`,
    )
    .all(params);
  return rows.map((r) => ({ ...r, kind: r.kind as MovementKind }));
}
