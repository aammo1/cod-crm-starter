import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadSource } from "../test-source.mjs";

process.env.DELIVERY_PROVIDER = "mock";
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "variant-cost-")), "crm.db");
process.env.AUTH_SECRET = "x".repeat(40);

const catalog = loadSource("@/lib/services/catalog");
const { toStorefrontCatalogProduct } = loadSource("@/lib/storefront-catalog-dto");

const input = {
  name: "Huile", category: "soin", price: 120,
  optionDefinitions: [{ name: "Contenance", values: ["100 ml", "500 ml"] }],
  variants: [
    { options: [{ name: "Contenance", value: "100 ml" }], costPrice: 40 },
    { options: [{ name: "Contenance", value: "500 ml" }] },
  ],
};

test("cost persists, round-trips, and ids/SKUs survive edits", () => {
  const created = catalog.createProduct(input);
  const costs = catalog.getVariantCosts(created.id);
  const [a, b] = created.variants;
  assert.equal(costs[a.id], 40);
  assert.equal(costs[b.id], null);

  const edited = catalog.updateProduct(created.id, {
    variants: [
      { id: a.id, sku: a.sku, options: a.options, costPrice: 55 },
      { id: b.id, sku: b.sku, options: b.options },
    ],
  });
  assert.deepEqual(edited.variants.map((v) => [v.id, v.sku]), [[a.id, a.sku], [b.id, b.sku]]);
  const after = catalog.getVariantCosts(created.id);
  assert.equal(after[a.id], 55);
  assert.equal(after[b.id], null);

  // Omitting variants and omitting costPrice both keep the stored cost.
  catalog.updateProduct(created.id, { name: "Huile bio" });
  assert.equal(catalog.getVariantCosts(created.id)[a.id], 55);
  catalog.updateProduct(created.id, { variants: [{ id: a.id, options: a.options }, { id: b.id, options: b.options }] });
  assert.equal(catalog.getVariantCosts(created.id)[a.id], 55);

  // null clears.
  catalog.updateProduct(created.id, { variants: [{ id: a.id, options: a.options, costPrice: null }, { id: b.id, options: b.options }] });
  assert.equal(catalog.getVariantCosts(created.id)[a.id], null);
});

test("invalid costs are rejected", () => {
  for (const costPrice of [-1, 1.5, 1_000_001]) {
    assert.throws(() => catalog.createProduct({ ...input, name: `X${costPrice}`, variants: [{ options: input.variants[0].options, costPrice }, input.variants[1]] }));
  }
});

test("cost never reaches catalog views or storefront DTOs", () => {
  const product = catalog.createProduct({ ...input, name: "Savon", variants: [{ ...input.variants[0], costPrice: 77 }, input.variants[1]] });
  const serialized = [
    JSON.stringify(catalog.listProducts({ includeInactive: true })),
    JSON.stringify(catalog.getProductBySlug(product.slug)),
    JSON.stringify(catalog.getVariantById(product.variants[0].id)),
    JSON.stringify(catalog.listStorefront()),
    JSON.stringify(catalog.getStorefrontProduct(product.slug)),
    JSON.stringify(toStorefrontCatalogProduct(catalog.getProductById(product.id), "https://shop.example")),
  ].join("\n");
  assert.doesNotMatch(serialized, /cost/i);
});
