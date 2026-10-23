import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import type { CommerceProduct, CommerceVariant, ProductOptionDefinition, ProductPack, PublicCommerceProduct, VariantOption } from "@/lib/commerce-types";
import { validateVariantCombinations, variantOptionsKey, variantOptionsLabel } from "@/lib/variant-options";
import { InventoryConflictError, InventoryValidationError } from "./inventory-errors";
import { getActivePacksFor } from "./packs";
import { getAppState, setAppState } from "./app-state";
import { createProductSchema, updateProductSchema, type CreateProductInput, type UpdateProductInput } from "./catalog-schemas";

export type { CreateProductInput, UpdateProductInput };

export type VariantView = CommerceVariant;
export interface CatalogProduct extends CommerceProduct {
  story: string; materials: string[];
  createdAt: string; updatedAt: string;
}
export interface StorefrontProductView extends PublicCommerceProduct {
  story: string; materials: string[]; anyAvailable: boolean;
}

interface ProductRow {
  id: string; slug: string; name: string; category: string; price: number;
  description: string; story: string; materials_json: string; badge: string | null;
  is_best_seller: number; upsell_ref: string | null; active: number;
  created_at: string; updated_at: string; images_json: string; option_definitions_json: string;
  landing_enabled: number;
}
interface VariantRow {
  id: string; product_id: string; sku: string; label: string; options_json: string;
  options_key: string; images_json: string; active: number; available: number;
}
const nowIso = () => new Date().toISOString();
const parse = <T>(json: string): T => JSON.parse(json) as T;
const slugify = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function variantRows(productId: string): VariantRow[] {
  return getDb().prepare(`SELECT v.*,
    MAX(COALESCE(sb.physical, 0) - COALESCE(sb.reserved, 0) - COALESCE(sb.quarantine, 0), 0) AS available
    FROM variants v
    LEFT JOIN stock_balances sb ON sb.variant_id = v.id AND sb.location = 'MAIN'
    WHERE v.product_id = ? ORDER BY v.rowid`).all(productId) as VariantRow[];
}
function hydrateProduct(row: ProductRow, packs: ProductPack[]): CatalogProduct {
  const images = parse<string[]>(row.images_json);
  const variants = variantRows(row.id).map((variant): VariantView => {
    const ownImages = parse<string[]>(variant.images_json);
    return {
      id: variant.id, productId: row.id, sku: variant.sku, label: variant.label,
      options: parse<VariantOption[]>(variant.options_json), images: ownImages.length ? ownImages : images,
      active: variant.active === 1, available: variant.available,
    };
  });
  return {
    id: row.id, slug: row.slug, name: row.name, category: row.category, price: row.price,
    description: row.description, story: row.story, materials: parse<string[]>(row.materials_json),
    ...(row.badge === null ? {} : { badge: row.badge }),
    ...(row.upsell_ref === null ? {} : { upsellRef: row.upsell_ref }),
    isBestSeller: row.is_best_seller === 1, packs, landingEnabled: row.landing_enabled === 1,
    active: row.active === 1, createdAt: row.created_at, updatedAt: row.updated_at,
    images, optionDefinitions: parse<ProductOptionDefinition[]>(row.option_definitions_json), variants,
  };
}

/** Stable ID order; internal projection includes inactive variants and numeric availability. */
export function listProducts(opts?: { includeInactive?: boolean }): CatalogProduct[] {
  const rows = getDb().prepare(`SELECT * FROM products ${opts?.includeInactive ? "" : "WHERE active = 1"} ORDER BY id`).all() as ProductRow[];
  const packs = getActivePacksFor(rows.map((row) => row.id));
  return rows.map((row) => hydrateProduct(row, packs[row.id] ?? []));
}
export function getProductById(id: string): CatalogProduct | null {
  const row = getDb().prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
  return row ? hydrateProduct(row, getActivePacksFor([row.id])[row.id] ?? []) : null;
}
export function getProductBySlug(slug: string): CatalogProduct | null {
  const row = getDb().prepare("SELECT * FROM products WHERE slug = ?").get(slug) as ProductRow | undefined;
  return row ? hydrateProduct(row, getActivePacksFor([row.id])[row.id] ?? []) : null;
}
/** Includes archived ownership/state for operational callers; checkout must check
 * both active and productActive. Zero availability does not invalidate checkout. */
export function getVariantById(id: string): (VariantView & { productActive: boolean; price: number; product: CatalogProduct }) | null {
  const owner = getDb().prepare("SELECT product_id FROM variants WHERE id = ?").get(id) as { product_id: string } | undefined;
  if (!owner) return null;
  const product = getProductById(owner.product_id)!;
  const variant = product.variants.find((entry) => entry.id === id)!;
  return { ...variant, productActive: product.active, price: product.price, product };
}

/** Explicit public whitelist: no numeric availability, balances or timestamps. */
export function toStorefrontProductView(product: CatalogProduct): StorefrontProductView {
  const variants = product.variants.filter((variant) => variant.active).map((variant) => ({
    id: variant.id, productId: variant.productId, sku: variant.sku, label: variant.label,
    options: variant.options, images: variant.images, active: true, available: variant.available > 0,
  }));
  return {
    id: product.id, slug: product.slug, name: product.name, category: product.category, price: product.price,
    description: product.description, story: product.story, materials: product.materials,
    ...(product.badge === undefined ? {} : { badge: product.badge }),
    ...(product.upsellRef === undefined ? {} : { upsellRef: product.upsellRef }),
    isBestSeller: product.isBestSeller, active: product.active, images: product.images,
    packs: product.packs, landingEnabled: product.landingEnabled,
    optionDefinitions: product.optionDefinitions, variants, anyAvailable: variants.some((variant) => variant.available),
  };
}
export function listStorefront(): StorefrontProductView[] { return listProducts().map(toStorefrontProductView); }
export function getStorefrontProduct(slug: string): StorefrontProductView | null {
  const product = getProductBySlug(slug);
  return product?.active ? toStorefrontProductView(product) : null;
}

type ParsedInput = ReturnType<typeof updateProductSchema.parse>;
type TargetVariant = NonNullable<ParsedInput["variants"]>[number];
interface VariantTarget extends TargetVariant { id: string; sku: string; label: string; images: string[]; active: boolean }

function cartesian(definitions: ProductOptionDefinition[]): TargetVariant[] {
  return definitions.reduce<VariantOption[][]>((sets, axis) => sets.flatMap((set) => axis.values.map((value) => [...set, { name: axis.name, value }])), [[]])
    .map((options) => ({ options }));
}

function resolveStructure(input: ParsedInput, current?: CatalogProduct): { definitions: ProductOptionDefinition[]; variants: TargetVariant[] } {
  const definitions = input.optionDefinitions ?? current?.optionDefinitions ?? [];
  if (definitions.reduce((count, axis) => count * axis.values.length, 1) > 100) throw new InventoryValidationError("Au maximum 100 combinaisons sont autorisées.");
  const variants = input.variants ?? (input.optionDefinitions !== undefined || !current ? cartesian(definitions) : current.variants.filter((v) => v.active).map((v) => ({
    id: v.id, sku: v.sku, label: v.label, options: v.options,
    images: parse<string[]>(variantRows(current.id).find((row) => row.id === v.id)!.images_json),
  })));
  return { definitions, variants };
}

function saveVariants(productId: string, targets: TargetVariant[], definitions: ProductOptionDefinition[], current?: CatalogProduct): VariantTarget[] {
  const db = getDb();
  const existing = current?.variants ?? [];
  const rows = variantRows(productId);
  const next = targets.map((target): VariantTarget => {
    const key = variantOptionsKey(target.options);
    const byId = target.id ? existing.find((variant) => variant.id === target.id) : undefined;
    if (target.id && !byId) throw new InventoryValidationError("Identifiant de variante inconnu ou appartenant à un autre produit.");
    const byOptions = existing.find((variant) => variantOptionsKey(variant.options) === key);
    if (byId && byOptions && byId.id !== byOptions.id) throw new InventoryConflictError("Cette combinaison appartient déjà à une variante, même archivée.");
    const match = byId ?? byOptions;
    if (match && target.sku !== undefined && target.sku !== match.sku) throw new InventoryValidationError("Le SKU d’une variante existante est immuable.");
    const id = match?.id ?? `var_${nanoid(16)}`;
    const sku = match?.sku ?? target.sku ?? `SKU-${nanoid(16)}`;
    const owner = db.prepare("SELECT id FROM variants WHERE sku = ?").get(sku) as { id: string } | undefined;
    if (owner && owner.id !== id) throw new InventoryConflictError("Ce SKU est déjà utilisé, y compris par une variante archivée.");
    const stored = match ? rows.find((row) => row.id === match.id) : undefined;
    const sameOptions = match && variantOptionsKey(match.options) === key;
    return { ...target, id, sku, label: target.label ?? (sameOptions ? match.label : variantOptionsLabel(target.options)),
      images: target.images ?? (stored ? parse<string[]>(stored.images_json) : []), active: target.active ?? true };
  });
  validateVariantCombinations(next, definitions);
  if (!definitions.length && !next[0].active) throw new InventoryValidationError("La variante Standard doit être active.");
  const ids = new Set(next.map((variant) => variant.id));
  for (const variant of existing) if (ids.has(variant.id)) db.prepare("UPDATE variants SET options_key = NULL WHERE id = ?").run(variant.id);
  db.prepare("UPDATE variants SET active = 0 WHERE product_id = ?").run(productId);
  for (const variant of next) {
    const values = { id: variant.id, product_id: productId, sku: variant.sku, label: variant.label,
      options_json: JSON.stringify(variant.options), options_key: variantOptionsKey(variant.options), images_json: JSON.stringify(variant.images),
      active: variant.active ? 1 : 0 };
    db.prepare(`INSERT INTO variants (id, product_id, sku, label, options_json, options_key, images_json, active)
      VALUES (@id, @product_id, @sku, @label, @options_json, @options_key, @images_json, @active)
      ON CONFLICT(id) DO UPDATE SET label=excluded.label, options_json=excluded.options_json, options_key=excluded.options_key,
      images_json=excluded.images_json, active=excluded.active`).run(values);
  }
  return next;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Create atomically. Omit variants to generate the option-definition Cartesian
 * set (or one Standard variant). New IDs/SKUs are server-generated unless a new
 * SKU is supplied; variant IDs are accepted only for matching rows on updates.
 * initialStock selects by options, stable variant ID or SKU,
 * writes exclusively through inventory, and is never accepted on updates.
 * requestId provides a durable exact-request replay without reopening stock. */
export function createProduct(input: CreateProductInput, opts?: { actor?: string }): CatalogProduct {
  const parsed = createProductSchema.parse(input);
  const slug = parsed.slug ?? slugify(parsed.name);
  if (!slug || slug.length > 200) throw new InventoryValidationError("Slug invalide.");
  const receiptKey = parsed.requestId ? `catalog-create:${parsed.requestId}` : null;
  const payload = canonical(parsed);
  let productId = slug;
  const db = getDb();
  db.transaction(() => {
    const receipt = receiptKey ? getAppState(receiptKey) : null;
    if (receipt) {
      const saved = parse<{ payload: string; productId: string }>(receipt);
      if (saved.payload !== payload) throw new InventoryConflictError("Cet identifiant de création a déjà été utilisé avec un contenu différent.");
      productId = saved.productId;
      return;
    }
    if (db.prepare("SELECT 1 FROM products WHERE slug = ? OR id = ?").get(slug, slug)) throw new InventoryConflictError("Un produit existe déjà avec ce slug.");
    const structure = resolveStructure(parsed);
    const now = nowIso();
    const images = parsed.images ?? [];
    db.prepare(`INSERT INTO products (id, slug, name, category, price, description, story, materials_json, badge,
      is_best_seller, upsell_ref, active, created_at, updated_at, images_json, option_definitions_json)
      VALUES (@id, @slug, @name, @category, @price, @description, @story, @materials, @badge,
      @bestSeller, @upsellRef, 1, @now, @now, @images, @definitions)`)
      .run({ id: productId, slug, name: parsed.name, category: parsed.category, price: parsed.price,
        description: parsed.description, story: parsed.story, materials: JSON.stringify(parsed.materials), badge: parsed.badge ?? null,
        bestSeller: parsed.isBestSeller ? 1 : 0, upsellRef: parsed.upsellRef ?? null, now,
        images: JSON.stringify(images), definitions: JSON.stringify(structure.definitions) });
    const variants = saveVariants(productId, structure.variants, structure.definitions);
    const opened = new Set<string>();
    for (const item of parsed.initialStock ?? []) {
      const variant = variants.find((entry) => "variantId" in item ? entry.id === item.variantId
        : "sku" in item ? entry.sku === item.sku
        : variantOptionsKey(entry.options) === variantOptionsKey(item.options));
      if (!variant || opened.has(variant.id)) throw new InventoryValidationError("Stock initial inconnu ou dupliqué pour cette variante.");
      opened.add(variant.id);
      // Inventory alone owns balances and ledger.
      openInitialStock(variant.id, item.qty, opts?.actor ?? "catalog");
    }
    if (receiptKey) setAppState(receiptKey, JSON.stringify({ payload, productId }));
  }).immediate();
  return getProductById(productId)!;
}

function openInitialStock(variantId: string, qty: number, actor: string): void {
  // Lazy module boundary avoids catalog/inventory circular initialization.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { openStock } = require("./inventory") as typeof import("./inventory");
  openStock(variantId, qty, actor, { source: "catalog", location: "MAIN" });
}

/** Partial product metadata update. When supplied, variants is the complete
 * desired set: omitted historical rows become inactive, never deleted. Pass id
 * when changing an option name/value; otherwise canonical options match even
 * inactive rows. Existing SKUs are immutable. Changing optionDefinitions alone
 * regenerates the desired combinations while reusing matching historical IDs.
 * Use null to clear badge/upsellRef and [] to clear gallery/materials. */
export function updateProduct(id: string, input: UpdateProductInput): CatalogProduct {
  const parsed = updateProductSchema.parse(input);
  const db = getDb();
  db.transaction(() => {
    const current = getProductById(id);
    if (!current) throw new InventoryValidationError("Produit introuvable.");
    const next = { ...current, ...parsed };
    const clash = db.prepare("SELECT id FROM products WHERE slug = ? AND id <> ?").get(next.slug, id);
    if (clash) throw new InventoryConflictError("Un produit existe déjà avec ce slug.");
    const structureChanged = parsed.variants !== undefined || parsed.optionDefinitions !== undefined;
    const structure = structureChanged ? resolveStructure(parsed, current) : null;
    db.prepare(`UPDATE products SET slug=@slug, name=@name, category=@category, price=@price,
      description=@description, story=@story, materials_json=@materials, badge=@badge,
      is_best_seller=@bestSeller, upsell_ref=@upsellRef, images_json=@images,
      option_definitions_json=@definitions, updated_at=@now WHERE id=@id`)
      .run({ id, slug: next.slug, name: next.name, category: next.category, price: next.price,
        description: next.description, story: next.story, materials: JSON.stringify(next.materials), badge: next.badge ?? null,
        bestSeller: next.isBestSeller ? 1 : 0, upsellRef: next.upsellRef ?? null, images: JSON.stringify(next.images),
        definitions: JSON.stringify(structure?.definitions ?? current.optionDefinitions), now: nowIso() });
    if (structure) saveVariants(id, structure.variants, structure.definitions, current);
  }).immediate();
  return getProductById(id)!;
}
export function archiveProduct(id: string): void {
  if (!getDb().prepare("UPDATE products SET active = 0, updated_at = ? WHERE id = ?").run(nowIso(), id).changes) throw new InventoryValidationError("Produit introuvable.");
}
export function restoreProduct(id: string): void {
  if (!getDb().prepare("UPDATE products SET active = 1, updated_at = ? WHERE id = ?").run(nowIso(), id).changes) throw new InventoryValidationError("Produit introuvable.");
}
