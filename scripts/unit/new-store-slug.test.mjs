import assert from "node:assert/strict";
import test from "node:test";
import { categorySlugs, normalizeDomain, randomStoreSlug, slugify, slugifyWithArabic } from "../new-store/slug.mjs";

test("latin slugify strips diacritics", () => {
  assert.equal(slugify("Crème Brûlée !"), "creme-brulee");
  assert.equal(slugify("متجر"), "");
});

test("arabic transliteration", () => {
  assert.equal(slugifyWithArabic("عبايات"), "abayat");
  assert.match(slugifyWithArabic("متجر الأناقة"), /^[a-z0-9-]+$/);
  assert.equal(slugifyWithArabic("😀"), "");
});

test("category slugs are unique with cat-n fallback", () => {
  const out = categorySlugs(["عبايات", "عبايات", "😀", "Shoes", "shoes"]);
  const slugs = out.map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(slugs[2], "cat-3");
  assert.equal(slugs[4], "shoes-2");
  assert.ok(slugs.every((s) => /^[a-z0-9-]+$/.test(s)));
});

test("random store slug", () => assert.match(randomStoreSlug(), /^store-[0-9a-f]{6}$/));

test("domain enforces https", () => {
  assert.equal(normalizeDomain("maboutique.ma"), "https://maboutique.ma");
  assert.equal(normalizeDomain("https://maboutique.ma/x"), "https://maboutique.ma");
  assert.equal(normalizeDomain("http://localhost:3000"), "http://localhost:3000");
  assert.throws(() => normalizeDomain("http://example.com"), /HTTPS/);
  assert.throws(() => normalizeDomain("ftp://example.com"));
});
