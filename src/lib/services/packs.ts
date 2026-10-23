import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "@/lib/validation";
import type { ProductPack } from "@/lib/commerce-types";
import { getDb } from "@/lib/db";
import { InventoryValidationError } from "./inventory-errors";

export const packsInputSchema = z.array(z.object({
  quantity: z.number().int().min(2).max(10),
  price: z.number().int().min(1),
  label: z.string().trim().min(1).max(60).optional(),
  highlight: z.boolean().optional(),
}).strict()).max(4);
export type PacksInput = z.infer<typeof packsInputSchema>;

interface PackRow { id: string; product_id: string; quantity: number; price_mad: number; label: string | null; highlight: number }
const toPack = (row: PackRow): ProductPack => ({
  id: row.id, quantity: row.quantity, price: row.price_mad,
  ...(row.label === null ? {} : { label: row.label }), highlight: row.highlight === 1,
});

/** One query for all products; grouped in JS, ordered by quantity. */
export function getActivePacksFor(productIds: readonly string[], db: Database.Database = getDb()): Record<string, ProductPack[]> {
  const ids = [...new Set(productIds)];
  const result: Record<string, ProductPack[]> = {};
  if (!ids.length) return result;
  const rows = db.prepare(`SELECT id, product_id, quantity, price_mad, label, highlight FROM product_packs
    WHERE active = 1 AND product_id IN (${ids.map(() => "?").join(",")}) ORDER BY product_id, quantity`).all(...ids) as PackRow[];
  for (const row of rows) (result[row.product_id] ??= []).push(toPack(row));
  return result;
}

export function listPacks(productId: string, db: Database.Database = getDb()): ProductPack[] {
  return getActivePacksFor([productId], db)[productId] ?? [];
}

export function replacePacks(productId: string, input: unknown): ProductPack[] {
  const parsed = packsInputSchema.safeParse(input);
  if (!parsed.success) throw new InventoryValidationError("Packs invalides : 4 packs maximum, quantités de 2 à 10, prix entiers en MAD.");
  const packs = parsed.data;
  const db = getDb();
  return db.transaction(() => {
    const product = db.prepare("SELECT price FROM products WHERE id = ?").get(productId) as { price: number } | undefined;
    if (!product) throw new InventoryValidationError("Produit introuvable.");
    if (new Set(packs.map((p) => p.quantity)).size !== packs.length) {
      throw new InventoryValidationError("Chaque quantité de pack doit être unique.");
    }
    for (const p of packs) {
      if (p.price >= p.quantity * product.price) {
        throw new InventoryValidationError(`Le prix du pack de ${p.quantity} doit être inférieur au prix normal (${p.quantity * product.price} MAD).`);
      }
    }
    const now = new Date().toISOString();
    // Deactivate, never delete: orders snapshot pack IDs.
    db.prepare("UPDATE product_packs SET active = 0, updated_at = ? WHERE product_id = ? AND active = 1").run(now, productId);
    const insert = db.prepare(`INSERT INTO product_packs (id, product_id, quantity, price_mad, label, highlight, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`);
    for (const p of packs) insert.run(randomUUID(), productId, p.quantity, p.price, p.label ?? null, p.highlight ? 1 : 0, now, now);
    return listPacks(productId, db);
  }).immediate();
}

export function setLandingEnabled(productId: string, enabled: boolean): void {
  const result = getDb().prepare("UPDATE products SET landing_enabled = ?, updated_at = ? WHERE id = ?")
    .run(enabled ? 1 : 0, new Date().toISOString(), productId);
  if (result.changes === 0) throw new InventoryValidationError("Produit introuvable.");
}

/** Saves packs and the landing flag atomically (better-sqlite3 nests transactions via savepoints). */
export function savePacksAndLanding(productId: string, input: { packs: unknown; landingEnabled: boolean }): { packs: ProductPack[]; landingEnabled: boolean } {
  const db = getDb();
  return db.transaction(() => {
    const packs = replacePacks(productId, input.packs);
    setLandingEnabled(productId, input.landingEnabled);
    return { packs, landingEnabled: input.landingEnabled };
  }).immediate();
}
