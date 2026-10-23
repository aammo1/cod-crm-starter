import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import Database from "better-sqlite3";

const root = fileURLToPath(new URL("../", import.meta.url));

test("production mock startup creates an empty isolated CRM and protects operational pages", { timeout: 60_000 }, async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "cod-crm-bootstrap-"));
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const dbPath = path.join(temp, "crm.db");
  const healthToken = randomBytes(32).toString("hex");
  // Deliberate env allowlist: never inherit courier/Meta/assistant/catalog secrets.
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: temp,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      AUTH_SECRET: randomBytes(32).toString("hex"),
      AUTH_TRUST_HOST: "true",
      SECURITY_ALLOWED_ORIGINS: origin,
      DB_PATH: dbPath,
      UPLOAD_DIR: path.join(temp, "uploads"),
      DELIVERY_PROVIDER: "mock",
      SECURITY_ACCEPT_GLOBAL_BUDGETS: "1",
      CRM_PUBLIC_URL: origin,
      HEALTH_DETAILS_TOKEN: healthToken,
      NODE_OPTIONS: `--import=${path.join(root, "scripts/block-external-network.mjs")}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const stopped = new Promise((resolve) => child.once("exit", resolve));
  let db;
  try {
    let health;
    for (let attempt = 0; attempt < 150; attempt++) {
      assert.equal(child.exitCode, null, output);
      try {
        const response = await fetch(`${origin}/api/health`, { headers: { Authorization: `Bearer ${healthToken}` } });
        if (response.ok) { health = await response.json(); break; }
      } catch { /* Wait for production server to bind. */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(health?.status, "ok", output);
    assert.equal(health.db, true);
    assert.equal(health.workers.submission.enabled, true);
    assert.equal(health.workers.tracking.enabled, true);
    assert.equal(health.workers.meta.enabled, false);
    assert.deepEqual(health.queues, { submissionsQueued: 0, submissionsNeedsReview: 0, submissionsFailed: 0 });
    for (const route of ["/crm", "/crm/equipe", "/crm/orders/new", "/admin"]) {
      const response = await fetch(`${origin}${route}`, { redirect: "manual" });
      assert.ok([302, 303, 307, 308].includes(response.status), `${route}: ${response.status}`);
      assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login");
    }
    const login = await fetch(`${origin}/login`);
    assert.equal(login.status, 200);
    const loginHtml = await login.text();
    assert.match(loginHtml, /Connexion/);
    // The CRM document is always French/LTR, whatever the storefront locale.
    assert.match(loginHtml, /<html lang="fr" dir="ltr"/);
    const shop = await fetch(`${origin}/boutique`);
    assert.equal(shop.status, 200);
    const shopHtml = await shop.text();
    assert.match(shopHtml, /Aucun produit pour le moment|لا توجد منتجات/);
    const storeLocale = /locale:\s*"(fr|ar)"/.exec(readFileSync(path.join(root, "store.config.ts"), "utf8"))?.[1] ?? "fr";
    assert.match(shopHtml, new RegExp(`<html lang="${storeLocale}" dir="${storeLocale === "ar" ? "rtl" : "ltr"}"`));
    assert.equal((await fetch(`${origin}/api/catalog-agent`)).status, 503);
    db = new Database(dbPath, { readonly: true });
    const expectedMigrations = readdirSync(path.join(root, "migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const appliedMigrations = db.prepare("SELECT name FROM _migrations ORDER BY name").all()
      .map(({ name }) => name);
    assert.deepEqual(appliedMigrations, expectedMigrations);
    for (const table of ["users", "products", "variants", "orders", "courier_submissions", "reservations", "stock_movements"]) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
    }
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    console.log(`Mock health, protected redirects, login, empty storefront, disabled automation, ${appliedMigrations.length} migrations and empty operational tables verified.`);
  } finally {
    db?.close();
    child.kill("SIGTERM");
    await stopped;
    rmSync(temp, { recursive: true, force: true });
  }
});
