#!/usr/bin/env node
// Post-build storefront budget check. Run after `next build`:
//
//   npm run build && npm run perf-budget
//
// Plain Node, no dependencies, never opens the database.
//
// Method (reliable on Next 15.5, App Router):
//  1. Static/ISR assertion from `.next/prerender-manifest.json`: `/`, `/boutique`, `/merci` and the
//     content pages must be in `routes`; `/produit/[slug]`, `/l/[slug]`, `/boutique/[categorie]`
//     must be in `dynamicRoutes`. A route built dynamic (cookies(), headers(), force-dynamic...) is
//     missing from both, so the failure names it.
//  2. JS size from `.next/app-build-manifest.json`: for each route, `pages[<route>/page]` plus the
//     `/(storefront)/layout` (storefront root layout) entry, JS files only, deduplicated, each gzipped at
//     level 9 and summed. The budget (default 120 KiB = 122,880 bytes) is enforced on
//     /produit/[slug] and /l/[slug]; the other storefront routes are reported only.
//  3. Forbidden client-bundle markers (zod, libphonenumber-js, DB driver, node:crypto) in the
//     chunks of the budgeted routes.
//
// Override the budget with PERF_BUDGET_KB (KiB, e.g. PERF_BUDGET_KB=130). Exit 0 on success, 1 on
// any failure.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_DIR = path.join(ROOT, ".next");
const SHARED_ENTRIES = ["/(storefront)/layout"];
const FORBIDDEN = ["libphonenumber", "ZodError", "better-sqlite3", "node:crypto"];

const rawBudget = process.env.PERF_BUDGET_KB;
const budgetKb = rawBudget === undefined || rawBudget === "" ? 120 : Number(rawBudget);
if (!Number.isFinite(budgetKb) || budgetKb <= 0) {
  console.error(`PERF_BUDGET_KB invalide : « ${rawBudget} » (nombre de KiB attendu).`);
  process.exit(1);
}
const budgetBytes = Math.round(budgetKb * 1024);

// route: public pattern; entry: key in app-build-manifest; kind: where it must appear in the
// prerender manifest; budgeted: enforced against the budget.
const ROUTES = [
  { route: "/produit/[slug]", entry: "/(storefront)/produit/[slug]/page", kind: "dynamicRoutes", budgeted: true },
  { route: "/l/[slug]", entry: "/(storefront)/l/[slug]/page", kind: "dynamicRoutes", budgeted: true },
  { route: "/boutique/[categorie]", entry: "/(storefront)/boutique/[categorie]/page", kind: "dynamicRoutes" },
  { route: "/", entry: "/(storefront)/page", kind: "routes" },
  { route: "/boutique", entry: "/(storefront)/boutique/page", kind: "routes" },
  { route: "/merci", entry: "/(storefront)/merci/page", kind: "routes" },
  { route: "/a-propos", entry: "/(storefront)/a-propos/page", kind: "routes" },
  { route: "/contact", entry: "/(storefront)/contact/page", kind: "routes" },
  { route: "/livraison-retours", entry: "/(storefront)/livraison-retours/page", kind: "routes" },
  { route: "/cgv", entry: "/(storefront)/cgv/page", kind: "routes" },
  { route: "/confidentialite", entry: "/(storefront)/confidentialite/page", kind: "routes" },
];
// Reported in the size table (the three shop pages and one content page); the rest only get the
// static/ISR assertion.
const REPORTED = new Set(["/produit/[slug]", "/l/[slug]", "/", "/boutique", "/merci", "/a-propos"]);

const failures = [];
const fail = (message) => failures.push(message);

function readJson(file) {
  const full = path.join(NEXT_DIR, file);
  if (!fs.existsSync(full)) {
    console.error(`${file} introuvable dans .next. Lancez d'abord \`npm run build\`.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

if (!fs.existsSync(NEXT_DIR)) {
  console.error("Dossier .next introuvable. Lancez d'abord `npm run build`.");
  process.exit(1);
}
const prerender = readJson("prerender-manifest.json");
const buildManifest = readJson("app-build-manifest.json").pages ?? {};

// 1. Static / ISR assertion.
for (const { route, kind } of ROUTES) {
  const bucket = prerender[kind] ?? {};
  if (!Object.prototype.hasOwnProperty.call(bucket, route)) {
    fail(
      `${route} : route absente de prerender-manifest.${kind} ; elle a été construite en dynamique ` +
        "(cookies(), headers(), searchParams, auth(), connection() ou force-dynamic sont interdits dans src/app/(storefront)).",
    );
  }
}

// 2. JS size.
const fileCache = new Map();
function measure(file) {
  let hit = fileCache.get(file);
  if (!hit) {
    const buf = fs.readFileSync(path.join(NEXT_DIR, file));
    hit = { raw: buf.length, gz: zlib.gzipSync(buf, { level: 9 }).length, text: buf.toString("utf8") };
    fileCache.set(file, hit);
  }
  return hit;
}

const rows = [];
const chunkUse = new Map(); // file -> gz
for (const spec of ROUTES) {
  if (!REPORTED.has(spec.route)) continue;
  const pageFiles = buildManifest[spec.entry];
  if (!pageFiles) {
    fail(`${spec.route} : entrée « ${spec.entry} » absente de app-build-manifest.json.`);
    continue;
  }
  const missingShared = SHARED_ENTRIES.filter((e) => !buildManifest[e]);
  if (missingShared.length) {
    fail(`${spec.route} : layouts absents de app-build-manifest.json (${missingShared.join(", ")}).`);
    continue;
  }
  const files = [...new Set([...pageFiles, ...SHARED_ENTRIES.flatMap((e) => buildManifest[e])])].filter((f) =>
    f.endsWith(".js"),
  );
  let raw = 0;
  let gz = 0;
  for (const file of files) {
    if (!fs.existsSync(path.join(NEXT_DIR, file))) {
      fail(`${spec.route} : fichier manquant ${file}.`);
      continue;
    }
    const m = measure(file);
    raw += m.raw;
    gz += m.gz;
    chunkUse.set(file, m.gz);
    if (spec.budgeted) {
      for (const marker of FORBIDDEN) {
        if (m.text.includes(marker)) fail(`${spec.route} : le chunk ${file} contient « ${marker} » (interdit côté client).`);
      }
    }
  }
  rows.push({ ...spec, files: files.length, raw, gz });
  if (spec.budgeted && gz > budgetBytes) {
    fail(
      `${spec.route} : ${(gz / 1024).toFixed(1)} KiB gzip > budget ${budgetKb} KiB ` +
        `(${(gz - budgetBytes)} octets de trop). Voir docs/operations.md#cache--performance.`,
    );
  }
}

// Output.
const kb = (n) => (n / 1024).toFixed(1).padStart(7);
console.log(`\nBudget JS storefront : ${budgetKb} KiB gzip (${budgetBytes} octets), fichiers .js dédupliqués, gzip niveau 9\n`);
console.log("Route                    Fichiers   Brut KiB   Gzip KiB   Budget");
for (const r of rows) {
  const status = r.budgeted ? (r.gz > budgetBytes ? "DÉPASSÉ" : "ok") : "info";
  console.log(`${r.route.padEnd(24)} ${String(r.files).padStart(8)} ${kb(r.raw)}   ${kb(r.gz)}   ${status}`);
}
const budgeted = rows.filter((r) => r.budgeted);
if (budgeted.length) {
  const used = new Set(budgeted.flatMap((r) => [...(buildManifest[r.entry] ?? []), ...SHARED_ENTRIES.flatMap((e) => buildManifest[e] ?? [])]));
  const top = [...chunkUse.entries()].filter(([f]) => used.has(f)).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log("\n5 plus gros chunks des routes budgétées (gzip) :");
  for (const [file, gz] of top) console.log(`  ${kb(gz)} KiB  ${file}`);
}

if (failures.length) {
  console.error(`\nÉCHEC (${failures.length}) :`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.log("\nOK : routes statiques/ISR et budget respectés.");
