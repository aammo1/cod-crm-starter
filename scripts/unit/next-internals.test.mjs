import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

// The storefront relies on Next internals (docs/template-upgrades.md, checklist item 1).
// A Next bump that moves them must fail loudly here.
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");

test("get-img-props and image-loader deep imports resolve", () => {
  const getImgProps = require("next/dist/shared/lib/get-img-props");
  assert.equal(typeof getImgProps.getImgProps, "function");
  require.resolve("next/dist/shared/lib/image-loader");
});

test("Next build still defines process.env.__NEXT_IMAGE_OPTS", () => {
  const defineEnv = require.resolve("next/dist/build/define-env");
  assert.match(fs.readFileSync(defineEnv, "utf8"), /__NEXT_IMAGE_OPTS/);
});

test("storefront image code still uses the documented internals", () => {
  const source = fs.readFileSync(
    path.join(root, "src/components/storefront/ui/store-image.tsx"),
    "utf8",
  );
  assert.match(source, /next\/dist\/shared\/lib\/get-img-props/);
  assert.match(source, /next\/dist\/shared\/lib\/image-loader/);
  assert.match(source, /__NEXT_IMAGE_OPTS/);
});
