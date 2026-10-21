import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Disposable consumer harness: server-only is a Next build marker, not a Node
// package runtime. Transpile the unchanged copyable files and actual CRM routes.
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const originalTs = Module._extensions[".ts"];
Module._resolveFilename = function (name, ...args) {
  return originalResolve.call(this, name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : name, ...args);
};
Module._load = function (name, ...args) {
  return name === "server-only" ? {} : originalLoad.call(this, name, ...args);
};
Module._extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(outputText, filename);
};

const temp = mkdtempSync(path.join(tmpdir(), "crm-client-16-"));
process.env.DB_PATH = path.join(temp, "crm.db");
process.env.UPLOAD_DIR = path.join(temp, "uploads");
process.env.DELIVERY_PROVIDER = "mock";
process.env.AUTH_SECRET = "test-auth-secret-16-independent-ephemeral";
process.env.STOREFRONT_API_KEY = "test-api-key-16-independent-ephemeral";
process.env.CRM_STOREFRONT_KEY = process.env.STOREFRONT_API_KEY;
process.env.STOREFRONT_SESSION_SECRET = "test-session-secret-16-independent-ephemeral";
process.env.STOREFRONT_ORIGIN = "https://storefront.example";
process.env.META_ACCESS_TOKEN = "";
process.env.META_PIXEL_ID = "";
process.env.NODE_ENV = "test";

const load = (name) => require(path.join(root, name));
const { createStorefrontClient, StorefrontError, configuredOrigin } = load("integrations/storefront-client.ts");
const catalogRoute = load("src/app/api/storefront/v1/catalog/route.ts");
const productRoute = load("src/app/api/storefront/v1/catalog/[slug]/route.ts");
const ordersRoute = load("src/app/api/storefront/v1/orders/route.ts");
const upsellRoute = load("src/app/api/storefront/v1/orders/[id]/upsell/route.ts");
const checkout = load("examples/nextjs/app/api/checkout/route.ts");
const upsell = load("examples/nextjs/app/api/checkout/upsell/route.ts");
const { checkoutInput } = load("examples/nextjs/lib/checkout-input.ts");
const { getDb } = load("src/lib/db.ts");
const { createProduct, updateProduct } = load("src/lib/services/catalog.ts");
const db = getDb();
const base = createProduct({
  name: "Sérum exemple", category: "Beauté", price: 199, images: ["/images/serum.webp"],
  optionDefinitions: [{ name: "Contenance", values: ["500 ml"] }],
  variants: [{ sku: "SERUM-500", options: [{ name: "Contenance", value: "500 ml" }] }],
});
const offered = createProduct({
  name: "Accessoire exemple", category: "Accessoires", price: 100,
  images: ["/images/accessoire.webp"], isBestSeller: true,
  initialStock: [{ options: [], qty: 5 }], requestId: "test16-accessory-stock",
});
const input = { customer: { name: "Client Exemple", phone: "0612345678" }, items: [{ variantId: base.variants[0].id, qty: 1 }] };
const seen = [];
let fault;
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    const url = new URL(incoming.url, process.env.CRM_BASE_URL);
    const request = new Request(url, { method: incoming.method, headers: incoming.headers,
      ...(["GET", "HEAD"].includes(incoming.method) ? {} : { body }) });
    seen.push({ path: url.pathname, key: request.headers.get("idempotency-key"),
      token: request.headers.get("x-order-token"), auth: request.headers.get("authorization"),
      origin: request.headers.get("origin"), ip: request.headers.get("x-forwarded-for"), body });
    const currentFault = fault;
    fault = undefined;
    if (currentFault === "slow") await new Promise((resolve) => setTimeout(resolve, 1100));
    let response;
    if (currentFault === "secret-error") {
      response = Response.json({ error: { code: process.env.CRM_STOREFRONT_KEY,
        message: `https://user:${process.env.CRM_STOREFRONT_KEY}@private.example` } }, { status: 400 });
    } else if (currentFault === "long-backoff") {
      response = Response.json({ error: { code: "RATE_LIMITED" } }, { status: 429, headers: { "Retry-After": "30" } });
    } else if (currentFault === "redirect") {
      response = Response.redirect(`${process.env.CRM_BASE_URL}/credential-trap`, 302);
    } else if (url.pathname === "/api/storefront/v1/catalog") response = await catalogRoute.GET(request);
    else if (url.pathname.startsWith("/api/storefront/v1/catalog/")) {
      response = await productRoute.GET(request, { params: Promise.resolve({ slug: decodeURIComponent(url.pathname.split("/").at(-1)) }) });
    } else if (url.pathname === "/api/storefront/v1/orders") response = await ordersRoute.POST(request);
    else if (/^\/api\/storefront\/v1\/orders\/[^/]+\/upsell$/.test(url.pathname)) {
      response = await upsellRoute.POST(request, { params: Promise.resolve({ id: decodeURIComponent(url.pathname.split("/").at(-2)) }) });
    } else response = new Response(null, { status: 404 });
    // Simulate a committed order whose success response was lost at the gateway.
    if (currentFault === "after-commit") {
      assert.equal(response.status, 201);
      response = Response.json({ error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503, headers: { "Retry-After": "0" } });
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500);
    outgoing.end();
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
process.env.CRM_BASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.CRM_PUBLIC_URL = process.env.CRM_BASE_URL;
const api = createStorefrontClient({ baseUrl: process.env.CRM_BASE_URL, apiKey: process.env.CRM_STOREFRONT_KEY });
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(temp, { recursive: true, force: true });
  Module._load = originalLoad;
  Module._resolveFilename = originalResolve;
  if (originalTs) Module._extensions[".ts"] = originalTs;
  else delete Module._extensions[".ts"];
});

const browserRequest = (body, cookie, extra = {}, method = "POST") => new Request("https://storefront.example/api/checkout", {
  method, headers: { origin: process.env.STOREFRONT_ORIGIN, "sec-fetch-site": "same-origin",
    "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extra }, body: JSON.stringify(body),
});
const cookieOf = (response) => response.headers.get("set-cookie").split(";")[0];
const bootstrap = () => checkout.PUT(browserRequest({}, undefined, {}, "PUT"));

test("standalone client: origins, real catalog DTOs, pagination, details and server authentication", async () => {
  for (const origin of ["http://remote.example", "https://user:password@crm.example", "https://crm.example/path", "https://crm.example?x=1"]) {
    assert.throws(() => configuredOrigin(origin), (e) => e.code === "INVALID_CONFIG");
  }
  assert.throws(() => configuredOrigin("http://localhost:3000", true));
  const page = await api.listCatalog({ limit: 1 });
  assert.equal(page.products.length, 1);
  assert.equal(page.settings.currency, "MAD");
  assert.ok(page.nextCursor);
  assert.equal((await api.listCatalog({ cursor: page.nextCursor, limit: 1 })).products.length, 1);
  const { product } = await api.getProduct(base.slug);
  assert.equal(product.price, 199);
  assert.equal(product.currency, "MAD");
  assert.equal(product.variants[0].available, false);
  assert.deepEqual(product.variants[0].options, [{ name: "Contenance", value: "500 ml" }]);
  assert.equal(product.images[0], `${process.env.CRM_BASE_URL}/images/serum.webp`);
  assert.equal("colors" in product, false);
  assert.equal("upsellRef" in product, false);
  assert.equal(seen.at(-1).origin, null);
  const badApi = createStorefrontClient({ baseUrl: process.env.CRM_BASE_URL, apiKey: "invalid-credential-with-at-least-32-characters" });
  const start = seen.length;
  await assert.rejects(badApi.listCatalog(), (e) => e instanceof StorefrontError && e.status === 401 && !e.retryable && e.attempts === 1);
  assert.equal(seen.length, start + 1);
  const direct = await fetch(`${process.env.CRM_BASE_URL}/api/storefront/v1/catalog`);
  assert.equal(direct.status, 401);
});

test("lost committed response retries with identical key/body, returns original receipt and immutable offer", async () => {
  const start = seen.length;
  fault = "after-commit";
  const result = await api.createOrder(input, { idempotencyKey: "client16-committed" });
  const attempts = seen.slice(start);
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 1);
  assert.equal(result.totals.total, 228);
  assert.equal(result.upsellOffer.upsellPrice, 70);
  assert.equal(result.upsellOffer.image, `${process.env.CRM_BASE_URL}/images/accessoire.webp`);
  updateProduct(base.id, { price: 299 });
  assert.deepEqual(await api.createOrder(input, { idempotencyKey: "client16-committed" }), result);
  const count = seen.length;
  await assert.rejects(api.createOrder({ ...input, customer: { ...input.customer, name: "Autre Client" } },
    { idempotencyKey: "client16-committed" }), (e) => e.status === 409 && e.code === "IDEMPOTENCY_CONFLICT" && !e.retryable);
  assert.equal(seen.length, count + 1);
  const resolution = { action: "accept", variantId: offered.variants[0].id };
  const options = { idempotencyKey: "client16-accept", orderToken: result.orderToken };
  const accepted = await api.resolveUpsell(result.orderId, resolution, options);
  assert.equal(accepted.upsellStatus, "accepted");
  assert.equal(accepted.totals.total, 298);
  assert.deepEqual(await api.resolveUpsell(result.orderId, resolution, options), accepted);
  await assert.rejects(api.resolveUpsell(result.orderId, { action: "decline" },
    { idempotencyKey: "client16-decline", orderToken: "invalid-token" }), (e) => e.status === 401);
});

test("typed errors scrub upstream secrets, respect backoff, bound timeouts and refuse redirects", async () => {
  fault = "secret-error";
  await assert.rejects(api.listCatalog(), (error) => {
    assert.equal(error.code, "UPSTREAM_ERROR");
    assert.equal(JSON.stringify(error).includes(process.env.CRM_STOREFRONT_KEY), false);
    assert.equal(error.stack.includes("private.example"), false);
    return true;
  });
  fault = "long-backoff";
  const count = seen.length;
  await assert.rejects(api.listCatalog(), (e) => e.status === 429 && e.retryable && e.retryAfterSeconds === 30);
  assert.equal(seen.length, count + 1);
  fault = "slow";
  const short = createStorefrontClient({ baseUrl: process.env.CRM_BASE_URL, apiKey: process.env.CRM_STOREFRONT_KEY,
    timeoutMs: 1000, maxRetries: 0 });
  await assert.rejects(short.listCatalog(), (e) => e.code === "TIMEOUT" && e.retryable && e.attempts === 1);
  fault = "redirect";
  const before = seen.length;
  await assert.rejects(short.listCatalog(), (e) => e.code === "NETWORK_ERROR");
  assert.equal(seen.length, before + 1);
  assert.ok(!seen.some((r) => r.path === "/credential-trap"));
});

test("public proxy: exact origin, strict body, consent whitelist, session binding and stable anonymous retries", async () => {
  const start = seen.length;
  const wrongOrigin = await checkout.POST(browserRequest(input, undefined, { origin: "https://evil.example" }));
  assert.equal(wrongOrigin.status, 403);
  assert.equal((await checkout.POST(browserRequest(input))).status, 401);
  const initial = await bootstrap();
  assert.equal(initial.status, 200);
  assert.match(initial.headers.get("set-cookie"), /HttpOnly/);
  assert.match(initial.headers.get("set-cookie"), /SameSite=strict/i);
  const cookie = cookieOf(initial);
  const body = { ...input, customer: { name: "Client Session", phone: "0712345678" }, attemptId: "browser16-checkout" };
  for (const invalid of [
    { ...body, price: 1 }, { ...body, orderId: "arbitrary-order" },
    { ...body, items: [{ variantId: base.variants[0].id, qty: 11 }] },
    { ...body, attribution: { consent: false, eventId: crypto.randomUUID(), sourceUrl: process.env.STOREFRONT_ORIGIN } },
    { ...body, attribution: { consent: true, eventId: crypto.randomUUID(), sourceUrl: process.env.STOREFRONT_ORIGIN, clientIpAddress: "1.2.3.4" } },
  ]) assert.equal((await checkout.POST(browserRequest(invalid, cookie))).status, 400);
  assert.equal((await checkout.POST(browserRequest(body, cookie, { "content-length": "999999" }))).status, 413);
  assert.equal(seen.length, start);
  const tracking = checkoutInput({ ...body, attribution: { consent: true, eventId: crypto.randomUUID(),
    sourceUrl: `${process.env.STOREFRONT_ORIGIN}/produit?secret=query#fragment`, fbp: "fb.1.123456789.123456789" } });
  assert.equal(tracking.input.meta.sourceUrl, `${process.env.STOREFRONT_ORIGIN}/produit`);
  assert.equal("consent" in tracking.input.meta, false);
  fault = "after-commit";
  const response = await checkout.POST(browserRequest(body, cookie, {
    authorization: "Bearer browser-untrusted", "x-order-token": "browser-untrusted", "x-forwarded-for": "1.2.3.4",
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal("orderToken" in result, false);
  const orderCookie = cookieOf(response);
  assert.equal(orderCookie.includes(result.orderId), false);
  assert.deepEqual(seen.at(-1), seen.at(-2));
  assert.equal(seen.at(-1).auth, `Bearer ${process.env.CRM_STOREFRONT_KEY}`);
  assert.equal(seen.at(-1).ip, null);
  // Original bootstrap cookie recovers a lost response containing the order cookie.
  const replay = await checkout.POST(browserRequest(body, cookie));
  assert.deepEqual(await replay.json(), result);
  const resolution = { checkoutAttemptId: body.attemptId, resolutionId: "browser16-resolution", resolution: { action: "decline" } };
  assert.equal((await upsell.POST(browserRequest(resolution, cookie))).status, 403);
  const unrelatedCookie = cookieOf(await bootstrap());
  assert.equal((await upsell.POST(browserRequest(resolution, unrelatedCookie))).status, 403);
  assert.equal((await upsell.POST(browserRequest({ ...resolution, orderId: result.orderId }, orderCookie))).status, 400);
  assert.equal((await upsell.POST(browserRequest({ ...resolution, checkoutAttemptId: "different-attempt" }, orderCookie))).status, 403);
  const separator = orderCookie.indexOf("=") + 1;
  const tampered = orderCookie.slice(0, separator) + (orderCookie[separator] === "a" ? "b" : "a") + orderCookie.slice(separator + 1);
  assert.equal((await upsell.POST(browserRequest(resolution, tampered))).status, 401);
  const resolved = await upsell.POST(browserRequest(resolution, orderCookie));
  assert.equal(resolved.status, 200);
  const resolvedBody = await resolved.json();
  const resolutionKey = seen.at(-1).key;
  assert.equal(resolvedBody.upsellStatus, "declined");
  assert.deepEqual(await (await upsell.POST(browserRequest(resolution, orderCookie))).json(), resolvedBody);
  assert.equal(seen.at(-1).key, resolutionKey);
  assert.equal((await checkout.POST(browserRequest({ ...body, customer: { ...body.customer, name: "Autre Nom" } }, cookie))).status, 409);
  // Same user-selected attempt in a different browser cannot retrieve this receipt.
  const otherBody = { ...body, customer: { name: "Autre Session", phone: "0612345679" } };
  const other = await checkout.POST(browserRequest(otherBody, unrelatedCookie));
  assert.equal(other.status, 200);
  assert.notEqual((await other.json()).orderId, result.orderId);
});

test("session expires absolutely and production cookie is Secure, HttpOnly and host-scoped", async () => {
  const { newSession, readSession, withSession, json } = load("examples/nextjs/lib/checkout-session.ts");
  const environment = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const session = newSession();
    const response = withSession(json({ ready: true }), session);
    const header = response.headers.get("set-cookie");
    assert.match(header, /^__Host-crm-checkout=/);
    assert.match(header, /; Secure/i);
    assert.match(header, /; HttpOnly/i);
    assert.match(header, /; Path=\//i);
    assert.doesNotMatch(header, /; Domain=/i);
    assert.equal(readSession(browserRequest({}, cookieOf(response))).sid, session.sid);
    const expired = withSession(json({ ready: true }), { ...session, expires: Date.now() - 1000 });
    assert.equal(readSession(browserRequest({}, cookieOf(expired))), undefined);
  } finally { process.env.NODE_ENV = environment; }
});

test("public limits cover streamed bodies, session floods and bootstrap rotation", async () => {
  const cookie = cookieOf(await bootstrap());
  const oversized = new Request("https://storefront.example/api/checkout", {
    method: "POST", headers: { origin: process.env.STOREFRONT_ORIGIN, "content-type": "application/json", cookie },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(16_385)); controller.close(); } }), duplex: "half",
  });
  assert.equal((await checkout.POST(oversized)).status, 413);
  const wrongContent = browserRequest({}, cookie, { "content-type": "text/plain" });
  assert.equal((await checkout.POST(wrongContent)).status, 415);
  let limited;
  for (let i = 0; i < 22; i++) {
    limited = await checkout.PUT(browserRequest({}, cookie, {}, "PUT"));
    if (limited.status === 429) break;
  }
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  for (let i = 0; i < 65; i++) {
    limited = await bootstrap();
    if (limited.status === 429) break;
  }
  assert.equal(limited.status, 429);
});
