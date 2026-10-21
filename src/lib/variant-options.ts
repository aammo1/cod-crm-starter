import type { ProductOptionDefinition, VariantOption } from "./commerce-types";

export const MAX_OPTION_AXES = 3;
export const MAX_PRODUCT_VARIANTS = 100;
export const MAX_OPTION_NAME_LENGTH = 80;
export const MAX_OPTION_VALUE_LENGTH = 120;
export const DEFAULT_VARIANT_LABEL = "Standard";

function boundedText(value: unknown, max: number, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} : texte requis.`);
  const text = value.normalize("NFKC").trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new Error(`${field} : texte non vide de ${max} caractères maximum requis.`);
  }
  return text;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

/** Trims display strings without changing their order or coercing option values. */
export function validateVariantOptions(input: unknown): VariantOption[] {
  if (!Array.isArray(input) || input.length > MAX_OPTION_AXES) {
    throw new Error(`Un produit accepte au maximum ${MAX_OPTION_AXES} options.`);
  }
  const names = new Set<string>();
  return input.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Option invalide.");
    const name = boundedText(entry.name, MAX_OPTION_NAME_LENGTH, "Nom d’option");
    const value = boundedText(entry.value, MAX_OPTION_VALUE_LENGTH, "Valeur d’option");
    const key = normalized(name);
    if (names.has(key)) throw new Error("Les noms d’options doivent être uniques.");
    names.add(key);
    return { name, value };
  });
}

/** variants.options_key: sorted normalized JSON pairs; empty set is exactly '[]'.
 * Use code-unit sorting, not localeCompare (keys must be stable on every host).
 */
export function variantOptionsKey(input: unknown): string {
  const pairs = validateVariantOptions(input).map(({ name, value }) => [normalized(name), normalized(value)]);
  pairs.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return JSON.stringify(pairs);
}

export function variantOptionsLabel(input: unknown): string {
  const options = validateVariantOptions(input);
  return options.length ? options.map(({ name, value }) => `${name} : ${value}`).join(" / ") : DEFAULT_VARIANT_LABEL;
}

export function validateOptionDefinitions(input: unknown): ProductOptionDefinition[] {
  if (!Array.isArray(input) || input.length > MAX_OPTION_AXES) {
    throw new Error(`Un produit accepte au maximum ${MAX_OPTION_AXES} options.`);
  }
  const names = new Set<string>();
  return input.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Définition d’option invalide.");
    const name = boundedText(entry.name, MAX_OPTION_NAME_LENGTH, "Nom d’option");
    if (names.has(normalized(name))) throw new Error("Les noms d’options doivent être uniques.");
    names.add(normalized(name));
    if (!Array.isArray(entry.values) || !entry.values.length || entry.values.length > MAX_PRODUCT_VARIANTS) {
      throw new Error("Une option nécessite entre 1 et 100 valeurs.");
    }
    const seen = new Set<string>();
    const values = entry.values.map((value: unknown) => {
      const text = boundedText(value, MAX_OPTION_VALUE_LENGTH, "Valeur d’option");
      if (seen.has(normalized(text))) throw new Error("Les valeurs d’options doivent être uniques.");
      seen.add(normalized(text));
      return text;
    });
    return { name, values };
  });
}

export function validateProductIdentity(input: { name: unknown; slug: unknown }): { name: string; slug: string } {
  const name = boundedText(input.name, 200, "Nom du produit");
  const slug = boundedText(input.slug, 200, "Slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Slug invalide.");
  return { name, slug };
}

export function validateVariantSku(input: unknown): string {
  const sku = boundedText(input, 100, "SKU");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sku)) throw new Error("SKU invalide.");
  return sku;
}

/** Validate the complete persisted set, including archived rows. Reuse IDs/SKUs
 * on edit: this helper never allocates identifiers or drops historical rows.
 * Global SKU/product slug uniqueness is additionally enforced by SQLite.
 */
export function validateVariantCombinations(
  variants: ReadonlyArray<{ id: string; sku: string; options: VariantOption[] }>,
  definitions: ReadonlyArray<ProductOptionDefinition>,
): void {
  const axes = validateOptionDefinitions(definitions);
  if (!variants.length || variants.length > MAX_PRODUCT_VARIANTS) throw new Error("Un produit nécessite entre 1 et 100 variantes.");
  if (!axes.length && variants.length !== 1) throw new Error("Un produit sans option possède une seule variante Standard.");
  const ids = new Set<string>();
  const skus = new Set<string>();
  const keys = new Set<string>();
  for (const variant of variants) {
    const id = boundedText(variant.id, 200, "Identifiant de variante");
    const sku = validateVariantSku(variant.sku);
    if (ids.has(id) || skus.has(sku)) throw new Error("Identifiants et SKU de variantes dupliqués.");
    ids.add(id);
    skus.add(sku);
    const options = validateVariantOptions(variant.options);
    if (options.length !== axes.length || axes.some((axis) => !options.some((option) =>
      normalized(option.name) === normalized(axis.name) && axis.values.some((value) => normalized(value) === normalized(option.value)),
    ))) throw new Error("Les options de la variante ne correspondent pas aux définitions du produit.");
    const key = variantOptionsKey(options);
    if (keys.has(key)) throw new Error("Combinaison d’options dupliquée.");
    keys.add(key);
  }
}
