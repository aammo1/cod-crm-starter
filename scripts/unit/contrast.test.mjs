import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../test-source.mjs";

const { bestForeground, contrastRatio, relativeLuminance } = loadSource("../src/config/contrast.ts");
const { storeConfigSchema } = loadSource("../src/config/schema.ts");
const raw = loadSource("../store.config.ts").default;

test("luminance and ratio match WCAG reference values", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.ok(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 1e-9);
  assert.ok(Math.abs(contrastRatio("#d97706", "#ffffff") - 3.19) < 0.02);
});

test("bestForeground picks the better of white and dark", () => {
  assert.equal(bestForeground("#d97706"), "#111827");
  assert.equal(bestForeground("#1f2937"), "#ffffff");
  assert.equal(bestForeground("#ffffff"), "#111827");
});

test("schema derives accentForeground when missing and keeps explicit values", () => {
  const colors = { ...raw.brand.colors };
  delete colors.accentForeground;
  const derived = storeConfigSchema.parse({ ...raw, brand: { ...raw.brand, colors } });
  assert.equal(derived.brand.colors.accentForeground, "#111827");
  const explicit = storeConfigSchema.parse({ ...raw, brand: { ...raw.brand, colors: { ...colors, accentForeground: "#ffffff" } } });
  assert.equal(explicit.brand.colors.accentForeground, "#ffffff");
});

test("default theme CTA text reaches 4.5:1", () => {
  const c = storeConfigSchema.parse(raw).brand.colors;
  assert.ok(contrastRatio(c.accent, c.accentForeground) >= 4.5);
});
