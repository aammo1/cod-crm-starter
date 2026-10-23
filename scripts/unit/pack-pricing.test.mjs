import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../test-source.mjs";

const { applyPacks } = loadSource("@/lib/pack-pricing");
const pack = (id, quantity, price) => ({ id, quantity, price });

test("single variant exact pack match", () => {
  const r = applyPacks([{ productId: "p", qty: 3, unitPrice: 100 }], { p: [pack("a", 3, 249)] });
  assert.equal(r.discount, 51);
  assert.deepEqual(r.applications, [{ productId: "p", packId: "a", quantity: 3, packPrice: 249, regularPrice: 300, discount: 51 }]);
});

test("mixed variant prices use true line sum", () => {
  const r = applyPacks([
    { productId: "p", qty: 2, unitPrice: 149 },
    { productId: "p", qty: 1, unitPrice: 179 },
  ], { p: [pack("a", 3, 399)] });
  assert.equal(r.applications[0].regularPrice, 477);
  assert.equal(r.discount, 78);
});

test("no pack for quantity", () => {
  const r = applyPacks([{ productId: "p", qty: 2, unitPrice: 100 }], { p: [pack("a", 3, 200)] });
  assert.equal(r.discount, 0);
  assert.equal(r.applications.length, 0);
});

test("pack price not below regular is skipped", () => {
  const r = applyPacks([{ productId: "p", qty: 2, unitPrice: 100 }], { p: [pack("a", 2, 200), pack("b", 2, 250)] });
  assert.equal(r.applications.length, 0);
});

test("two products sum discounts, integers only", () => {
  const r = applyPacks([
    { productId: "p", qty: 2, unitPrice: 100 },
    { productId: "q", qty: 3, unitPrice: 50 },
  ], { p: [pack("a", 2, 180)], q: [pack("b", 3, 120)] });
  assert.equal(r.applications.length, 2);
  assert.equal(r.discount, 20 + 30);
  for (const a of r.applications) for (const v of [a.regularPrice, a.discount, a.packPrice]) assert.ok(Number.isInteger(v));
});
