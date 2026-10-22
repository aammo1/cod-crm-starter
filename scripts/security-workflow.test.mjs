import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";
import { loadSource } from "./test-source.mjs";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cod-crm-security-"));
process.env.DB_PATH = path.join(temp, "test.db");
process.env.UPLOAD_DIR = path.join(temp, "uploads");
process.env.DELIVERY_PROVIDER = "mock";
process.env.AUTH_SECRET = randomBytes(32).toString("hex");
process.env.CRM_PUBLIC_URL = "https://crm.example.test";
delete process.env.SECURITY_ALLOWED_ORIGINS;
delete process.env.SECURITY_TRUSTED_IP_HEADER;
delete process.env.STOREFRONT_API_KEY;
const { getDb } = loadSource("@/lib/db");
const {
  consumeBudgets, trustedClientIp, budgetKey, consumeStorefrontNewOrderPhoneBudget,
} = loadSource("@/lib/services/security-budgets");
const { authenticateCredentials } = loadSource("@/lib/services/credentials");
const { hashPassword, verifyPasswordAsync } = loadSource("@/lib/password");
const { readLimitedJson, readLimitedFormData } = loadSource("@/lib/request-body");
const { browserMutationAllowed } = loadSource("@/lib/browser-mutation");
const { createAgent, updateAgent, resetAgentPassword } = loadSource("@/lib/services/team");

// Only framework request context/server-only marker are replaced. Security,
// account validation, roles, SQLite transactions and budgets are real services.
let session = null;
function loadWithMocks(name, mocks) {
  const original = Module._load;
  Module._load = function (request, ...args) {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    return original.call(this, request, ...args);
  };
  try { return loadSource(name); } finally { Module._load = original; }
}
const { requireStorefrontApi, storefrontError, readStorefrontJson } = loadWithMocks("@/lib/storefront-auth", { "server-only": {} });
const { requireUser, requireAdmin, AuthGuardError } = loadWithMocks("@/lib/auth-guards", {
  "@/auth": { auth: async () => session },
  "next/headers": { headers: async () => new Headers({ accept: "application/json" }) },
});
const { default: middleware, config: middlewareConfig } = loadWithMocks("@/middleware", {
  "next-auth": () => ({ auth: () => () => { throw new Error("Unexpected page auth in API fixture"); } }),
});
const { requireCatalogAgent } = loadSource("@/lib/catalog-agent-auth");
const db = getDb();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

function request(body = {}, route = "crm/team", headers = {}) {
  return new Request(`https://crm.example.test/api/${route}`, {
    method: "POST",
    headers: { host: "crm.example.test", origin: "https://crm.example.test", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const key = randomBytes(32).toString("hex");
function integration(headers = {}, route = "storefront/v1/orders") {
  return new Request(`https://crm.example.test/api/${route}`, {
    method: "POST", headers: { authorization: `Bearer ${key}`, ...headers }, body: "{}",
  });
}
function resetBudgets() { db.prepare("DELETE FROM security_budgets").run(); }
async function denied(request, status, code) {
  const result = requireStorefrontApi(request);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, status);
  const body = await result.response.json();
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
  assert.equal(JSON.stringify(body).includes(key), false);
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.equal(result.response.headers.has("access-control-allow-origin"), false);
  return result.response;
}

test("runtime-only storefront config fails closed and bearer syntax rejects alternate credentials", async () => {
  resetBudgets();
  for (const invalid of [undefined, "short", " ".repeat(32), "x".repeat(32) + ",bad"]) {
    if (invalid === undefined) delete process.env.STOREFRONT_API_KEY;
    else process.env.STOREFRONT_API_KEY = invalid;
    await denied(integration(), 503, "STOREFRONT_DISABLED");
  }
  process.env.STOREFRONT_API_KEY = key;
  for (const authorization of ["", "Basic " + key, "Bearer wrong", `Bearer  ${key}`, `Bearer ${key}, Bearer ${key}`, `Bearer ${key} extra`]) {
    const response = await denied(integration({ authorization }), 401, "UNAUTHORIZED");
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
  }
  const duplicates = new Headers();
  duplicates.append("authorization", `Bearer ${key}`);
  duplicates.append("authorization", `Bearer ${key}`);
  await denied(new Request("https://crm.example.test/api/storefront/v1/catalog", { headers: duplicates }), 401, "UNAUTHORIZED");
  await denied(new Request(`https://crm.example.test/api/storefront/v1/catalog?key=${key}`, {
    headers: { cookie: "authjs.session-token=browser-session" },
  }), 401, "UNAUTHORIZED");
  assert.deepEqual(requireStorefrontApi(integration()), { ok: true });
  assert.deepEqual(requireStorefrontApi(integration({ authorization: `bearer ${key}` })), { ok: true });
  // Rotation is observed immediately without reimport/rebuild.
  process.env.STOREFRONT_API_KEY = randomBytes(32).toString("hex");
  await denied(integration(), 401, "UNAUTHORIZED");
  process.env.STOREFRONT_API_KEY = key;
});

test("integration boundary rejects browsers and grants no other API permissions", async () => {
  resetBudgets();
  for (const headers of [{ origin: "https://shop.example.test" }, { origin: process.env.CRM_PUBLIC_URL }, { origin: "null" }, { "sec-fetch-site": "same-origin" }]) {
    await denied(integration(headers), 403, "BROWSER_ACCESS_FORBIDDEN");
  }
  for (const route of ["admin/products", "crm/team", "crm/stock", "catalog-agent/products", "storefront/v10/catalog"]) {
    await denied(integration({}, route), 403, "FORBIDDEN");
  }
  const catalogKey = randomBytes(32).toString("hex");
  process.env.CATALOG_AGENT_KEY = catalogKey;
  assert.throws(() => requireCatalogAgent(integration()), (error) => error.status === 401);
  await denied(integration({ authorization: `Bearer ${catalogKey}` }), 401, "UNAUTHORIZED");
  requireCatalogAgent(integration({ authorization: `Bearer ${catalogKey}` }));
  delete process.env.CATALOG_AGENT_KEY;
});

test("authenticated global budget applies to reads/replays and ignores untrusted forwarding headers", async () => {
  resetBudgets();
  const expires = Date.now() + 60_000;
  db.prepare("INSERT INTO security_budgets VALUES ('storefront:v1:global', 599, ?)").run(expires);
  const read = () => new Request("https://crm.example.test/api/storefront/v1/catalog", {
    headers: { authorization: `Bearer ${key}`, "x-forwarded-for": randomBytes(4).join(".") },
  });
  assert.equal(requireStorefrontApi(read()).ok, true);
  const response = await denied(read(), 429, "RATE_LIMITED");
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.deepEqual(db.prepare("SELECT hits, expires_at FROM security_budgets WHERE key = 'storefront:v1:global'").get(), { hits: 600, expires_at: expires });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM security_budgets").get().n, 1);
  resetBudgets();
  process.env.SECURITY_TRUSTED_IP_HEADER = "x-real-ip";
  const ipKey = budgetKey("storefront:v1:ip", "203.0.113.8");
  db.prepare("INSERT INTO security_budgets VALUES (?, 120, ?)").run(ipKey, expires);
  await denied(integration({ "x-real-ip": "203.0.113.8" }), 429, "RATE_LIMITED");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM security_budgets WHERE key = 'storefront:v1:global'").get().n, 0);
  delete process.env.SECURITY_TRUSTED_IP_HEADER;
});

test("new-order phone hook normalizes numbers, is separate from auth/replay and rolls back with order transaction", () => {
  resetBudgets();
  for (let i = 0; i < 5; i++) assert.equal(consumeStorefrontNewOrderPhoneBudget("0612345678"), 0);
  const phoneKey = budgetKey("checkout:phone", "+212612345678");
  const before = db.prepare("SELECT * FROM security_budgets WHERE key = ?").get(phoneKey);
  assert.ok(before);
  // Replay handlers use auth/global protection but never call the new-order hook.
  for (let i = 0; i < 8; i++) assert.equal(requireStorefrontApi(integration()).ok, true);
  assert.deepEqual(db.prepare("SELECT * FROM security_budgets WHERE key = ?").get(phoneKey), before);
  assert.ok(consumeStorefrontNewOrderPhoneBudget("+212612345678") > 0);
  assert.deepEqual(db.prepare("SELECT * FROM security_budgets WHERE key = ?").get(phoneKey), before);
  assert.throws(() => db.transaction(() => {
    assert.equal(consumeStorefrontNewOrderPhoneBudget("0623456789"), 0);
    throw new Error("order write failed");
  }).immediate(), /order write failed/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM security_budgets WHERE key = ?").get(budgetKey("checkout:phone", "+212623456789")).n, 0);
  assert.throws(() => consumeStorefrontNewOrderPhoneBudget("not-a-phone"), /invalide/);
});

test("stream limits reject chunked/multibyte JSON and return v1 envelopes while preserving multipart", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('"éééé"')); },
    cancel() { cancelled = true; },
  });
  const chunked = new Request("https://crm.example.test", { method: "POST", body: stream, duplex: "half", headers: { "content-length": "1" } });
  await assert.rejects(readLimitedJson(chunked, 8), (error) => error.status === 413);
  assert.equal(cancelled, true);
  for (const [body, status, code] of [['"' + "x".repeat(33_000) + '"', 413, "PAYLOAD_TOO_LARGE"], ["{", 400, "INVALID_REQUEST"]]) {
    const result = await readStorefrontJson(request(body));
    assert.equal(result.ok, false);
    assert.equal(result.response.status, status);
    assert.equal((await result.response.json()).error.code, code);
  }
  assert.deepEqual(await readStorefrontJson(request({ items: [] })), { ok: true, body: { items: [] } });
  const form = new FormData();
  form.append("file", new File(["image bytes"], "test.webp", { type: "image/webp" }));
  const encoded = new Response(form);
  const bytes = await encoded.arrayBuffer();
  const multipart = () => new Request("https://crm.example.test", { method: "POST", body: bytes, headers: encoded.headers });
  const parsed = await readLimitedFormData(multipart(), 1024);
  assert.equal(await parsed.get("file").text(), "image bytes");
  await assert.rejects(readLimitedFormData(multipart(), 10), (error) => error.status === 413);
  assert.deepEqual(await storefrontError("RATE_LIMITED", "Réessayez dans quelques instants.", 429, 20).json(), {
    error: { code: "RATE_LIMITED", message: "Réessayez dans quelques instants." },
  });
});

test("shared budgets are atomic across processes, expire, and denials do not extend them", async () => {
  resetBudgets();
  const program = `import {loadSource} from './scripts/test-source.mjs';
    const {consumeBudgets}=loadSource('@/lib/services/security-budgets');
    let accepted=0;for(let i=0;i<10;i++)if(!consumeBudgets([{key:'race',limit:10,windowMs:60000}]))accepted++;
    process.stdout.write(String(accepted));loadSource('@/lib/db').getDb().close();`;
  const run = promisify(execFile);
  const results = await Promise.all(Array.from({ length: 4 }, () => run(process.execPath, ["--input-type=module", "-e", program], { env: process.env })));
  assert.equal(results.reduce((sum, result) => sum + Number(result.stdout), 0), 10);
  const before = db.prepare("SELECT * FROM security_budgets WHERE key = 'race'").get();
  assert.ok(consumeBudgets([{ key: "race", limit: 10, windowMs: 60_000 }]) > 0);
  assert.deepEqual(db.prepare("SELECT * FROM security_budgets WHERE key = 'race'").get(), before);
  assert.equal(consumeBudgets([{ key: "race", limit: 10, windowMs: 60_000 }], before.expires_at + 1), 0);
});

test("credentials retain attempt limits, session revocation and admin/agent separation", async () => {
  resetBudgets();
  const password = "Long-Test-Password-123!";
  const agent = createAgent({ name: "Agent test", email: "agent@example.test", password }, "admin-test");
  const credentials = { email: " AGENT@example.test ", password };
  const saved = await authenticateCredentials(credentials, request());
  assert.equal(saved.id, agent.id);
  assert.equal(saved.role, "agent");
  assert.equal(saved.sessionVersion, 0);
  session = null;
  await assert.rejects(requireUser(), (error) => error instanceof AuthGuardError && error.status === 401);
  assert.equal(requireStorefrontApi(integration()).ok, true);
  await assert.rejects(requireAdmin(), (error) => error.status === 401);
  session = { user: saved };
  assert.equal((await requireUser()).role, "agent");
  await assert.rejects(requireAdmin(), (error) => error.status === 403);
  // Database role, not a forged/stale session role, is authoritative.
  session = { user: { ...saved, role: "admin" } };
  await assert.rejects(requireAdmin(), (error) => error.status === 403);
  const admin = createAgent({ name: "Admin test", email: "admin@example.test", password }, "admin-test");
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.id);
  session = { user: { id: admin.id, sessionVersion: 0 } };
  assert.equal((await requireAdmin()).role, "admin");
  // Only failures count: a correct login neither burns the account budget nor stays blocked by earlier ones.
  for (let i = 0; i < 9; i++) assert.equal(await authenticateCredentials({ ...credentials, password: "wrong" }, request()), null);
  assert.equal((await authenticateCredentials(credentials, request())).id, agent.id);
  for (let i = 0; i < 10; i++) assert.equal(await authenticateCredentials({ ...credentials, password: "wrong" }, request()), null);
  assert.equal(await authenticateCredentials(credentials, request()), null);
  resetBudgets();
  resetAgentPassword(agent.id, "New-Test-Password-456!", "admin-test");
  session = { user: saved };
  await assert.rejects(requireUser(), (error) => error.status === 401);
  assert.equal(await authenticateCredentials(credentials, request()), null);
  const refreshed = await authenticateCredentials({ ...credentials, password: "New-Test-Password-456!" }, request());
  assert.equal(refreshed.sessionVersion, 1);
  updateAgent(agent.id, { isActive: false }, "admin-test");
  session = { user: refreshed };
  await assert.rejects(requireUser(), (error) => error.status === 401);
  assert.equal(await authenticateCredentials({ ...credentials, password: "New-Test-Password-456!" }, request()), null);
  session = null;
  const events = db.prepare("SELECT * FROM security_audit WHERE target_id = ? ORDER BY id").all(agent.id);
  assert.deepEqual(events.map((event) => event.event), ["agent.created", "agent.password_reset", "agent.disabled"]);
  assert.ok(events.every((event) => event.actor_id === "admin-test"));
  assert.equal(JSON.stringify(events).includes(password), false);
  assert.equal(JSON.stringify(events).includes(key), false);
  const before = db.prepare("SELECT COUNT(*) n FROM users").get().n;
  assert.throws(() => createAgent({ name: "Rollback", email: "rollback@example.test", password }, ""));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, before);
  assert.equal(await verifyPasswordAsync(password, hashPassword(password)), true);
  assert.equal(await verifyPasswordAsync(password, "scrypt$bad$bad"), false);
});

test("portable browser origin policy rejects missing, sibling, opaque, malformed and forged-host origins", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(browserMutationAllowed(request()), true);
    for (const origin of ["https://evil.crm.example.test", "https://attacker.example", "https://zehri.ma", "https://www.zehri.ma", "null", "", "https://crm.example.test:444"]) {
      assert.equal(browserMutationAllowed(request({}, "crm/team", { origin, host: "attacker.example", "x-forwarded-host": "attacker.example" })), false);
    }
    assert.equal(browserMutationAllowed(new Request("https://crm.example.test/api/crm/team", { method: "POST" })), false);
    assert.equal(browserMutationAllowed(new Request("https://crm.example.test/api/crm/orders")), true);
    process.env.SECURITY_ALLOWED_ORIGINS = "https://admin.example.test,https://bad.example.test/path,https://*.example.test,https://user@userinfo.example.test";
    assert.equal(browserMutationAllowed(request({}, "crm/team", { origin: "https://admin.example.test" })), true);
    for (const origin of ["https://bad.example.test", "https://sub.example.test", "https://userinfo.example.test"]) {
      assert.equal(browserMutationAllowed(request({}, "crm/team", { origin })), false);
    }
    delete process.env.CRM_PUBLIC_URL;
    delete process.env.SECURITY_ALLOWED_ORIGINS;
    assert.equal(browserMutationAllowed(request()), false);
    process.env.SECURITY_ALLOWED_ORIGINS = "http://localhost:3000";
    assert.equal(browserMutationAllowed(request({}, "crm/team", { origin: "http://localhost:3000" })), true);
  } finally {
    process.env.CRM_PUBLIC_URL = "https://crm.example.test";
    delete process.env.SECURITY_ALLOWED_ORIGINS;
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
  for (const route of ["crm/team", "admin/products", "crm", "admin"]) {
    const req = request({}, route, { origin: "https://attacker.example", authorization: `Bearer ${key}` });
    Object.defineProperty(req, "nextUrl", { value: new URL(req.url) });
    assert.equal(middleware(req, {}).status, 403);
  }
  assert.equal(middlewareConfig.matcher.includes("/api/storefront/:path*"), false);
  const spoofed = request({}, "crm/team", { "x-real-ip": "203.0.113.8", "x-forwarded-for": "203.0.113.9, 203.0.113.10" });
  assert.equal(trustedClientIp(spoofed), null);
  process.env.SECURITY_TRUSTED_IP_HEADER = "x-forwarded-for";
  assert.equal(trustedClientIp(spoofed), "203.0.113.10");
  assert.equal(trustedClientIp(request({}, "crm/team", { "x-forwarded-for": "203.0.113.9, invalid" })), null);
  delete process.env.SECURITY_TRUSTED_IP_HEADER;
});
