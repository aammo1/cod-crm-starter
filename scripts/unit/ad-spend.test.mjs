import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "../test-source.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-ad-spend-"));
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.UPLOAD_DIR = path.join(tempDir, "uploads");
process.env.DELIVERY_PROVIDER = "mock";

const { getDb } = loadSource("@/lib/db");
const { upsertAdSpend, listAdSpend, deleteAdSpend, adSpendTotals } = loadSource("@/lib/services/ad-spend");
const db = getDb();
after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const add = (day, channel, amount, campaign = "") => upsertAdSpend({ day, channel, campaign, amount }, null);

test("upsert is idempotent on (day, channel, campaign)", () => {
  const a = add("2026-10-01", "meta", 100, "spring");
  const b = add("2026-10-01", "meta", 150, "spring");
  assert.equal(a.id, b.id);
  assert.equal(b.amount, 150);
  assert.equal(listAdSpend({ from: "2026-10-01", to: "2026-10-01" }).length, 1);
});

test("totals by channel, campaign and day over a range", () => {
  add("2026-10-01", "tiktok", 40);
  add("2026-10-02", "meta", 60, "spring");
  add("2026-10-02", "meta", 10, "");
  add("2026-09-30", "google", 999);
  const range = { from: "2026-10-01", to: "2026-10-02" };
  assert.deepEqual(adSpendTotals({ ...range, groupBy: "channel" }),
    [{ key: "meta", amount: 220 }, { key: "tiktok", amount: 40 }]);
  assert.deepEqual(adSpendTotals({ ...range, groupBy: "campaign" }),
    [{ key: "", amount: 50 }, { key: "spring", amount: 210 }]);
  assert.deepEqual(adSpendTotals({ ...range, groupBy: "day" }),
    [{ key: "2026-10-01", amount: 190 }, { key: "2026-10-02", amount: 70 }]);
});

test("rejects invalid input and deletes", () => {
  assert.throws(() => add("2026-13-01", "meta", 1), /Date invalide/);
  assert.throws(() => add("2026-10-01", "x", 1), /Canal invalide/);
  assert.throws(() => add("2026-10-01", "meta", 1.5), /entier/);
  assert.throws(() => add("2026-10-01", "meta", -1), /positif/);
  assert.throws(() => adSpendTotals({ from: "2026-10-02", to: "2026-10-01", groupBy: "day" }), /Période/);
  const row = add("2026-10-05", "snap", 5);
  deleteAdSpend(row.id);
  assert.throws(() => deleteAdSpend(row.id), /introuvable/);
});
