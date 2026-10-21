import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { Badge, CategorySlug } from "@/lib/types";
import { ensureStockBalance, openStock, InventoryConflictError, InventoryValidationError } from "./inventory";
import { getAppState, setAppState } from "./app-state";
import {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from "./catalog-schemas";

export type { CreateProductInput, UpdateProductInput };

type Stmt = Database.Statement;

export interface CatalogColorView {
  id: string;
  name: string;
  hex: string;
  position: number;
  images: string[];
}

export interface VariantView {
  variantId: string;
  sku: string;
  size: string;
  colorId: string;
  colorName: string;
  colorHex: string;
  images: string[];
  available: number;
  active: boolean;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  category: CategorySlug;
  price: number;
  description: string;
  story: string;
  materials: string[];
  badge: Badge | null;
  isBestSeller: boolean;
  upsellRef: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  colors: CatalogColorView[];
  variants: VariantView[];
}

export interface StorefrontSizeView {
  size: string;
  available: boolean;
}

export interface StorefrontColorView {
  name: string;
  hex: string;
  images: string[];
  sizes: StorefrontSizeView[];
}

export interface StorefrontProductView {
  id: string;
  slug: string;
  name: string;
  category: CategorySlug;
  price: number;
  description: string;
  story: string;
  materials: string[];
  badge: Badge | null;
  isBestSeller: boolean;
  upsellRef: string | null;
  colors: StorefrontColorView[];
  anyAvailable: boolean;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  description: string;
  story: string;
  materials_json: string;
  badge: string | null;
  is_best_seller: number;
  upsell_ref: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

interface ColorRow {
  id: string;
  product_id: string;
  name: string;
  hex: string;
  position: number;
  images_json: string;
}

interface VariantAvailabilityRow {
  variant_id: string;
  sku: string;
  size: string;
  active: number;
  color_id: string;
  color_name: string;
  color_hex: string;
  color_position: number;
  color_images_json: string;
  available: number;
}

interface VariantRow {
  id: string;
  color_id: string;
  size: string;
  sku: string;
  active: number;
}

interface Statements {
  productsActive: Stmt;
  productsAll: Stmt;
  productById: Stmt;
  productBySlug: Stmt;
  productIdBySlug: Stmt;
  insertProduct: Stmt;
  updateProduct: Stmt;
  archiveProduct: Stmt;
  restoreProduct: Stmt;
  colorsByProduct: Stmt;
  insertColor: Stmt;
  updateColor: Stmt;
  variantsWithAvailability: Stmt;
  variantsByProduct: Stmt;
  insertVariant: Stmt;
  activateVariant: Stmt;
  deactivateVariant: Stmt;
  deactivateVariantsByColor: Stmt;
  skuExists: Stmt;
  variantFor: Stmt;
}

// Prepared once per process, on first use — importing this module (e.g. during
// `next build` page-data collection) must never open the database (see db.ts).
let statementsCache: Statements | null = null;

function stmts(): Statements {
  if (statementsCache) return statementsCache;
  const db = getDb();
  statementsCache = {
    productsActive: db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC"),
    productsAll: db.prepare("SELECT * FROM products ORDER BY created_at DESC"),
    productById: db.prepare("SELECT * FROM products WHERE id = ?"),
    productBySlug: db.prepare("SELECT * FROM products WHERE slug = ?"),
    productIdBySlug: db.prepare("SELECT id FROM products WHERE slug = ?"),
    insertProduct: db.prepare(`
      INSERT INTO products (
        id, slug, name, category, price, description, story, materials_json,
        badge, is_best_seller, upsell_ref, active, created_at, updated_at
      ) VALUES (
        @id, @slug, @name, @category, @price, @description, @story, @materials_json,
        @badge, @is_best_seller, @upsell_ref, 1, @created_at, @updated_at
      )
    `),
    // Unset fields are passed as NULL and keep the current value via COALESCE.
    updateProduct: db.prepare(`
      UPDATE products SET
        slug = COALESCE(@slug, slug),
        name = COALESCE(@name, name),
        category = COALESCE(@category, category),
        price = COALESCE(@price, price),
        description = COALESCE(@description, description),
        story = COALESCE(@story, story),
        materials_json = COALESCE(@materials_json, materials_json),
        badge = COALESCE(@badge, badge),
        is_best_seller = COALESCE(@is_best_seller, is_best_seller),
        upsell_ref = COALESCE(@upsell_ref, upsell_ref),
        updated_at = @updated_at
      WHERE id = @id
    `),
    archiveProduct: db.prepare("UPDATE products SET active = 0, updated_at = ? WHERE id = ?"),
    restoreProduct: db.prepare("UPDATE products SET active = 1, updated_at = ? WHERE id = ?"),
    colorsByProduct: db.prepare("SELECT * FROM product_colors WHERE product_id = ? ORDER BY position ASC, name ASC"),
    insertColor: db.prepare(`
      INSERT INTO product_colors (id, product_id, name, hex, position, images_json)
      VALUES (@id, @product_id, @name, @hex, @position, @images_json)
    `),
    updateColor: db.prepare(`
      UPDATE product_colors
      SET hex = @hex, images_json = @images_json, position = @position
      WHERE id = @id
    `),
    // Missing balance row = 0 available; clamped at 0 so it is never negative.
    variantsWithAvailability: db.prepare(`
      SELECT
        v.id AS variant_id, v.sku, v.size, v.active,
        c.id AS color_id, c.name AS color_name, c.hex AS color_hex,
        c.position AS color_position, c.images_json AS color_images_json,
        MAX(
          COALESCE(sb.physical, 0) - COALESCE(sb.quarantine, 0) - COALESCE(sb.reserved, 0),
          0
        ) AS available
      FROM variants v
      JOIN product_colors c ON c.id = v.color_id
      LEFT JOIN stock_balances sb ON sb.variant_id = v.id AND sb.location = 'ZEHRI'
      WHERE v.product_id = ?
      ORDER BY c.position ASC, c.name ASC, CAST(v.size AS INTEGER) ASC, v.size ASC
    `),
    variantsByProduct: db.prepare(`
      SELECT id, color_id, size, sku, active
      FROM variants
      WHERE product_id = ?
      ORDER BY CAST(size AS INTEGER) ASC, size ASC
    `),
    insertVariant: db.prepare(`
      INSERT INTO variants (id, product_id, color_id, size, sku, active)
      VALUES (@id, @product_id, @color_id, @size, @sku, 1)
    `),
    activateVariant: db.prepare("UPDATE variants SET active = 1 WHERE id = ?"),
    deactivateVariant: db.prepare("UPDATE variants SET active = 0 WHERE id = ?"),
    deactivateVariantsByColor: db.prepare("UPDATE variants SET active = 0 WHERE color_id = ? AND active = 1"),
    skuExists: db.prepare("SELECT 1 FROM variants WHERE sku = ? LIMIT 1"),
    variantFor: db.prepare(`
      SELECT v.id AS variantId, v.sku
      FROM variants v
      JOIN product_colors c ON c.id = v.color_id
      WHERE v.product_id = ? AND c.name = ? AND v.size = ? AND v.active = 1
      LIMIT 1
    `),
  };
  return statementsCache;
}

function nowIso(): string {
  return new Date().toISOString();
}

// Diacritics-stripping style of src/lib/slug.ts.
function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// SKU codes: "bottines-cadena" -> "CAD" (first 3 letters of the id's last
// segment), "Maron" -> "MAR". Generated products get id = slug so the code
// stays meaningful and deterministic.
function prodCode(productId: string): string {
  const tail = productId.split("-").filter(Boolean).pop() ?? productId;
  const letters = stripDiacritics(tail).replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 3) || "PRD").toUpperCase();
}

function colorCode(colorName: string): string {
  const letters = stripDiacritics(colorName).replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 3) || "COL").toUpperCase();
}

function buildSku(productId: string, colorName: string, size: string): string {
  const base = `${prodCode(productId)}-${colorCode(colorName)}-${size}`;
  if (!stmts().skuExists.get(base)) return base;
  let suffix = 2;
  while (stmts().skuExists.get(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function parseStringArray(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.map(String);
  } catch {
    return [];
  }
}

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const na = Number.parseInt(a, 10);
    const nb = Number.parseInt(b, 10);
    if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
    return na - nb || a.localeCompare(b);
  });
}

function mapColorRow(row: ColorRow): CatalogColorView {
  return {
    id: row.id,
    name: row.name,
    hex: row.hex,
    position: row.position,
    images: parseStringArray(row.images_json),
  };
}

function mapVariantRow(row: VariantAvailabilityRow): VariantView {
  return {
    variantId: row.variant_id,
    sku: row.sku,
    size: row.size,
    colorId: row.color_id,
    colorName: row.color_name,
    colorHex: row.color_hex,
    images: parseStringArray(row.color_images_json),
    available: row.available,
    active: row.active === 1,
  };
}

function hydrateProduct(row: ProductRow): CatalogProduct {
  const s = stmts();
  const colors = (s.colorsByProduct.all(row.id) as ColorRow[]).map(mapColorRow);
  const variants = (s.variantsWithAvailability.all(row.id) as VariantAvailabilityRow[]).map(mapVariantRow);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category as CategorySlug,
    price: row.price,
    description: row.description,
    story: row.story,
    materials: parseStringArray(row.materials_json),
    badge: (row.badge as Badge | null) ?? null,
    isBestSeller: row.is_best_seller === 1,
    upsellRef: row.upsell_ref,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    colors,
    variants,
  };
}

function toStorefrontProductView(product: CatalogProduct): StorefrontProductView {
  const colors: StorefrontColorView[] = product.colors
    .map((color) => ({
      name: color.name,
      hex: color.hex,
      images: color.images,
      sizes: product.variants
        .filter((v) => v.colorId === color.id && v.active)
        .map((v) => ({ size: v.size, available: v.available > 0 })),
    }))
    .filter((color) => color.sizes.length > 0);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    price: product.price,
    description: product.description,
    story: product.story,
    materials: product.materials,
    badge: product.badge,
    isBestSeller: product.isBestSeller,
    upsellRef: product.upsellRef,
    colors,
    anyAvailable: colors.some((color) => color.sizes.some((size) => size.available)),
  };
}

export function listProducts(opts?: { includeInactive?: boolean }): CatalogProduct[] {
  const s = stmts();
  const rows = (opts?.includeInactive ? s.productsAll : s.productsActive).all() as ProductRow[];
  return rows.map(hydrateProduct);
}

export function getProductById(id: string): CatalogProduct | null {
  const row = stmts().productById.get(id) as ProductRow | undefined;
  return row ? hydrateProduct(row) : null;
}

export function getProductBySlug(slug: string): CatalogProduct | null {
  const row = stmts().productBySlug.get(slug) as ProductRow | undefined;
  return row ? hydrateProduct(row) : null;
}

export function listStorefront(): StorefrontProductView[] {
  return listProducts().map(toStorefrontProductView);
}

export function getStorefrontProduct(slug: string): StorefrontProductView | null {
  const product = getProductBySlug(slug);
  return product && product.active ? toStorefrontProductView(product) : null;
}

export function variantFor(
  productId: string,
  colorName: string,
  size: string,
): { variantId: string; sku: string } | null {
  const row = stmts().variantFor.get(productId, colorName, size) as
    | { variantId: string; sku: string }
    | undefined;
  return row ?? null;
}

export function createProduct(input: CreateProductInput, opts?: { actor?: string }): CatalogProduct {
  const parsed = createProductSchema.parse(input);
  const slug = slugify(parsed.slug ?? parsed.name);
  if (!slug) {
    throw new InventoryValidationError("Impossible de générer un slug valide à partir du nom du produit.");
  }
  const db = getDb();
  // Persist the original request, rather than comparing to mutable product/stock state.
  const receiptKey = parsed.requestId ? `catalog-create:${parsed.requestId}` : null;
  const payload = JSON.stringify({ ...parsed, initialStock: parsed.initialStock?.slice().sort((a, b) =>
    a.colorKey.localeCompare(b.colorKey) || a.size.localeCompare(b.size)) });
  let productId = slug;
  db.transaction(() => {
    const receipt = receiptKey ? getAppState(receiptKey) : null;
    if (receipt) {
      const saved = JSON.parse(receipt) as { payload: string; productId: string };
      if (saved.payload !== payload) throw new InventoryConflictError("Cet identifiant de création a déjà été utilisé avec un contenu différent.");
      productId = saved.productId;
      return;
    }
    if (stmts().productIdBySlug.get(slug)) {
      throw new InventoryConflictError(`Un produit existe déjà avec le slug « ${slug} ».`);
    }
    const now = nowIso();
    stmts().insertProduct.run({
      id: slug,
      slug,
      name: parsed.name,
      category: parsed.category,
      price: parsed.price,
      description: parsed.description,
      story: parsed.story,
      materials_json: JSON.stringify(parsed.materials),
      badge: parsed.badge ?? null,
      is_best_seller: parsed.isBestSeller ? 1 : 0,
      upsell_ref: parsed.upsellRef ?? null,
      created_at: now,
      updated_at: now,
    });
    const sizes = [...new Set(parsed.sizes)].sort((a, b) => a - b).map(String);
    parsed.colors.forEach((color, index) => {
      const colorId = `pc_${nanoid(12)}`;
      stmts().insertColor.run({
        id: colorId,
        product_id: slug,
        name: color.name,
        hex: color.hex,
        position: index,
        images_json: JSON.stringify(color.images),
      });
      for (const size of sizes) {
        const variantId = `var_${nanoid(12)}`;
        stmts().insertVariant.run({
          id: variantId,
          product_id: slug,
          color_id: colorId,
          size,
          sku: buildSku(slug, color.name, size),
        });
        ensureStockBalance(variantId);
        const initial = parsed.initialStock?.find((item) => item.colorKey === color.name && item.size === size);
        if (initial) openStock(variantId, initial.qty, opts?.actor ?? "catalog", { source: "catalog" });
      }
    });
    if (receiptKey) setAppState(receiptKey, JSON.stringify({ payload, productId }));
  }).immediate();
  return getProductById(productId) as CatalogProduct;
}

export function updateProduct(id: string, input: UpdateProductInput): CatalogProduct {
  const parsed = updateProductSchema.parse(input);
  const db = getDb();
  db.transaction(() => {
    const row = stmts().productById.get(id) as ProductRow | undefined;
    if (!row) throw new Error("Produit introuvable.");
    const now = nowIso();

    let slug: string | null = null;
    if (parsed.slug !== undefined) {
      const nextSlug = slugify(parsed.slug);
      if (!nextSlug) throw new Error("Slug invalide.");
      if (nextSlug !== row.slug) {
        const clash = stmts().productIdBySlug.get(nextSlug) as { id: string } | undefined;
        if (clash && clash.id !== id) {
          throw new Error(`Un produit existe déjà avec le slug « ${nextSlug} ».`);
        }
        slug = nextSlug;
      }
    }

    stmts().updateProduct.run({
      id,
      updated_at: now,
      slug,
      name: parsed.name ?? null,
      category: parsed.category ?? null,
      price: parsed.price ?? null,
      description: parsed.description ?? null,
      story: parsed.story ?? null,
      materials_json: parsed.materials ? JSON.stringify(parsed.materials) : null,
      badge: parsed.badge ?? null,
      is_best_seller: parsed.isBestSeller === undefined ? null : parsed.isBestSeller ? 1 : 0,
      upsell_ref: parsed.upsellRef ?? null,
    });

    if (parsed.colors === undefined && parsed.sizes === undefined) return;

    if (parsed.colors) {
      const existingColors = stmts().colorsByProduct.all(id) as ColorRow[];
      const listedNames = new Set(parsed.colors.map((c) => c.name));
      parsed.colors.forEach((color, index) => {
        const match = existingColors.find((c) => c.name === color.name);
        if (match) {
          stmts().updateColor.run({
            id: match.id,
            hex: color.hex,
            images_json: JSON.stringify(color.images),
            position: index,
          });
        } else {
          stmts().insertColor.run({
            id: `pc_${nanoid(12)}`,
            product_id: id,
            name: color.name,
            hex: color.hex,
            position: index,
            images_json: JSON.stringify(color.images),
          });
        }
      });
      for (const color of existingColors) {
        if (!listedNames.has(color.name)) stmts().deactivateVariantsByColor.run(color.id);
      }
    }

    const colors = stmts().colorsByProduct.all(id) as ColorRow[];
    const allVariants = stmts().variantsByProduct.all(id) as VariantRow[];

    const targetSizes = parsed.sizes
      ? [...new Set(parsed.sizes)].sort((a, b) => a - b).map(String)
      : null;

    const activeSizesByColor = new Map<string, string[]>();
    for (const variant of allVariants) {
      if (!variant.active) continue;
      const sizes = activeSizesByColor.get(variant.color_id) ?? [];
      if (!sizes.includes(variant.size)) sizes.push(variant.size);
      activeSizesByColor.set(variant.color_id, sizes);
    }
    const productActiveSizes = sortSizes(
      allVariants.filter((v) => v.active).map((v) => v.size),
    );

    for (const color of colors) {
      const isListed = parsed.colors
        ? parsed.colors.some((c) => c.name === color.name)
        : (activeSizesByColor.get(color.id)?.length ?? 0) > 0;
      if (!isListed) continue;

      // Sizes come from the input when given; otherwise a color keeps its own
      // active sizes, and a (re-)listed color inherits the product's active
      // sizes.
      const ownActiveSizes = activeSizesByColor.get(color.id) ?? [];
      const sizes = targetSizes ?? (ownActiveSizes.length > 0 ? sortSizes(ownActiveSizes) : productActiveSizes);

      const colorVariants = allVariants.filter((v) => v.color_id === color.id);
      const bySize = new Map(colorVariants.map((v) => [v.size, v]));
      for (const size of sizes) {
        const existing = bySize.get(size);
        if (existing) {
          if (!existing.active) {
            stmts().activateVariant.run(existing.id);
            ensureStockBalance(existing.id);
          }
        } else {
          const variantId = `var_${nanoid(12)}`;
          stmts().insertVariant.run({
            id: variantId,
            product_id: id,
            color_id: color.id,
            size,
            sku: buildSku(id, color.name, size),
          });
          ensureStockBalance(variantId);
        }
      }
      if (targetSizes) {
        for (const variant of colorVariants) {
          if (variant.active && !sizes.includes(variant.size)) {
            stmts().deactivateVariant.run(variant.id);
          }
        }
      }
    }
  })();
  return getProductById(id) as CatalogProduct;
}

export function archiveProduct(id: string): void {
  const result = stmts().archiveProduct.run(nowIso(), id);
  if (result.changes === 0) throw new Error("Produit introuvable.");
}

export function restoreProduct(id: string): void {
  const result = stmts().restoreProduct.run(nowIso(), id);
  if (result.changes === 0) throw new Error("Produit introuvable.");
}
