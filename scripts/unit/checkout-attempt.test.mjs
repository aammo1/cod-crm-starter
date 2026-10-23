import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../test-source.mjs";

const { decideAttempt, attemptOutcome, describeFailure } = loadSource("../src/components/storefront/funnel/checkout-attempt.ts");
const mint = () => ({ key: "k-new", eventId: "e-new" });
const base = { key: "k1", payload: '{"p":1}', eventId: "e1", createdAt: 1 };

test("changed payload mints a new key only when the attempt is not uncertain", () => {
  const d = decideAttempt({ ...base, uncertain: false }, '{"p":2}', 5, mint);
  assert.equal(d.attempt.key, "k-new");
  assert.equal(d.fresh, true);
});

test("uncertain attempt keeps key and original payload after the form is edited", () => {
  const d = decideAttempt({ ...base, uncertain: true }, '{"p":2}', 5, mint);
  assert.equal(d.attempt.key, "k1");
  assert.equal(d.attempt.payload, '{"p":1}');
  assert.equal(d.locked, true);
  assert.equal(d.fresh, false);
  assert.equal(decideAttempt({ ...base, uncertain: true }, '{"p":1}', 5, mint).locked, false);
});

test("same payload reuses key; no record mints one", () => {
  assert.equal(decideAttempt({ ...base, uncertain: false }, '{"p":1}', 5, mint).attempt.key, "k1");
  assert.equal(decideAttempt(null, "x", 5, mint).attempt.uncertain, false);
});

test("outcomes: 5xx/timeout uncertain; 400 and phone quota clear; 409/429 keep", () => {
  assert.equal(attemptOutcome(0, "TIMEOUT"), "uncertain");
  assert.equal(attemptOutcome(503, "X"), "uncertain");
  assert.equal(attemptOutcome(400, "INVALID_PHONE"), "clear");
  assert.equal(attemptOutcome(429, "PHONE_RECENTLY_ORDERED"), "clear");
  assert.equal(attemptOutcome(429, "RATE_LIMITED"), "keep");
  assert.equal(attemptOutcome(409, "IDEMPOTENCY_MISMATCH"), "keep");
});

const labels = { genericError: "g", phoneInvalid: "pi", phoneRecentlyOrdered: "pr", retryLaterSeconds: "wait {s}",
  checkoutUncertain: "u", checkoutUncertainLocked: "l" };
test("failure views", () => {
  assert.equal(describeFailure({ status: 400, code: "INVALID_PHONE", uncertain: false }, labels).phoneField, true);
  const rate = describeFailure({ status: 429, code: "RATE_LIMITED", retryAfter: 12, uncertain: false }, labels);
  assert.equal(rate.message, "wait 12");
  assert.equal(rate.cooldown, 12);
  assert.equal(describeFailure({ status: 429, code: "PHONE_RECENTLY_ORDERED", uncertain: false }, labels).whatsapp, true);
  const u = describeFailure({ status: 0, code: "TIMEOUT", uncertain: true }, labels);
  assert.deepEqual([u.whatsapp, u.retry], [true, true]);
  assert.equal(describeFailure({ status: 0, code: "UNCERTAIN_LOCKED", uncertain: true }, labels).message, "l");
});
