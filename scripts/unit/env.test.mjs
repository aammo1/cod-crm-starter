import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../test-source.mjs";

const { validateRuntimeEnv, runtimeEnvWarnings, deliveryProviderName } = loadSource("@/lib/env");

const SECRET = "s3cr3t-value-that-is-definitely-long-enough-123";
const good = () => ({
  NODE_ENV: "production", AUTH_SECRET: SECRET, CRM_PUBLIC_URL: "https://crm.example.test",
  SECURITY_ALLOWED_ORIGINS: "https://crm.example.test", DELIVERY_PROVIDER: "mock", SECURITY_ACCEPT_GLOBAL_BUDGETS: "1",
});
const fails = (env, ...names) => {
  assert.throws(() => validateRuntimeEnv(env), (error) => {
    assert.match(error.message, /^Configuration invalide : /);
    for (const name of names) assert.ok(error.message.includes(name), `${name} in ${error.message}`);
    return true;
  });
};

test("development and build phase are no-ops", () => {
  validateRuntimeEnv({ NODE_ENV: "development" });
  validateRuntimeEnv({});
  validateRuntimeEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" });
});

test("valid production configs pass", () => {
  validateRuntimeEnv(good());
  const rest = good(); delete rest.SECURITY_ACCEPT_GLOBAL_BUDGETS;
  validateRuntimeEnv({ ...rest, SECURITY_TRUSTED_IP_HEADER: "x-real-ip" });
  validateRuntimeEnv({ ...good(), DELIVERY_PROVIDER: "ozon", OZON_CLIENT_ID: "id", OZON_API_KEY: "key" });
});

test("each missing variable is named", () => {
  for (const name of ["AUTH_SECRET", "CRM_PUBLIC_URL", "SECURITY_ALLOWED_ORIGINS", "DELIVERY_PROVIDER"]) {
    const env = good(); delete env[name]; fails(env, name);
  }
  const env = good(); delete env.SECURITY_ACCEPT_GLOBAL_BUDGETS;
  fails(env, "SECURITY_TRUSTED_IP_HEADER", "SECURITY_ACCEPT_GLOBAL_BUDGETS");
  fails({ ...good(), SECURITY_ACCEPT_GLOBAL_BUDGETS: "0" }, "SECURITY_TRUSTED_IP_HEADER");
});

test("invalid values are rejected", () => {
  fails({ ...good(), AUTH_SECRET: "short" }, "AUTH_SECRET");
  fails({ ...good(), CRM_PUBLIC_URL: "https://crm.example.test/app" }, "CRM_PUBLIC_URL");
  fails({ ...good(), CRM_PUBLIC_URL: "ftp://x.test" }, "CRM_PUBLIC_URL");
  fails({ ...good(), SECURITY_ALLOWED_ORIGINS: "https://a.test/path" }, "SECURITY_ALLOWED_ORIGINS");
  fails({ ...good(), SECURITY_ALLOWED_ORIGINS: "https://*.a.test" }, "SECURITY_ALLOWED_ORIGINS");
  fails({ ...good(), DELIVERY_PROVIDER: "MOCK" }, "DELIVERY_PROVIDER");
  fails({ ...good(), DELIVERY_PROVIDER: "" }, "DELIVERY_PROVIDER");
});

test("ozon requires credentials", () => {
  fails({ ...good(), DELIVERY_PROVIDER: "ozon" }, "OZON_CLIENT_ID", "OZON_API_KEY");
  fails({ ...good(), DELIVERY_PROVIDER: "ozon", OZON_CLIENT_ID: "id" }, "OZON_API_KEY");
});

test("errors list every problem and never leak values", () => {
  const env = { NODE_ENV: "production", AUTH_SECRET: "tiny-secret", CRM_PUBLIC_URL: "https://leak.example/secret-path",
    DELIVERY_PROVIDER: "ozon", OZON_CLIENT_ID: "", OZON_API_KEY: "" };
  assert.throws(() => validateRuntimeEnv(env), (error) => {
    for (const value of ["tiny-secret", "secret-path", "leak.example"]) assert.ok(!error.message.includes(value));
    for (const name of ["AUTH_SECRET", "CRM_PUBLIC_URL", "SECURITY_ALLOWED_ORIGINS", "OZON_CLIENT_ID", "OZON_API_KEY", "SECURITY_TRUSTED_IP_HEADER"]) {
      assert.ok(error.message.includes(name), name);
    }
    return true;
  });
});

test("warnings and provider helper", () => {
  const warnings = runtimeEnvWarnings(good());
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /Transporteur fictif \(mock\) actif en production/);
  assert.match(warnings[1], /SECURITY_ACCEPT_GLOBAL_BUDGETS/);
  assert.deepEqual(runtimeEnvWarnings({ NODE_ENV: "development", DELIVERY_PROVIDER: "mock" }), []);
  assert.equal(deliveryProviderName({ DELIVERY_PROVIDER: "mock" }), "mock");
  assert.equal(deliveryProviderName({ DELIVERY_PROVIDER: "Mock" }), "ozon");
  assert.equal(deliveryProviderName({}), "ozon");
});
