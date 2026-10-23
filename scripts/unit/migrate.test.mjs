import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadSource } from "../test-source.mjs";

const Database = loadSource("better-sqlite3");
const { runMigrations } = loadSource("@/lib/migrate.ts");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-test-"));
  const dir = path.join(root, "migrations");
  fs.mkdirSync(dir);
  const db = new Database(path.join(root, "test.db"));
  return { root, dir, db };
}
const write = (dir, name, sql) => fs.writeFileSync(path.join(dir, name), sql);

test("trigger body with semicolons applies", () => {
  const { dir, db } = setup();
  write(dir, "001_a.sql", `CREATE TABLE a (id INTEGER);
CREATE TABLE log (n INTEGER);
CREATE TRIGGER a_ai AFTER INSERT ON a
BEGIN
  INSERT INTO log (n) VALUES (1);
  INSERT INTO log (n) VALUES (2);
END;
`);
  runMigrations(db, dir);
  db.prepare("INSERT INTO a (id) VALUES (1)").run();
  assert.equal(db.prepare("SELECT COUNT(*) c FROM log").get().c, 2);
});

test("string literal containing ';\\n' applies", () => {
  const { dir, db } = setup();
  write(dir, "001_a.sql", "CREATE TABLE t (v TEXT);\nINSERT INTO t VALUES ('a;\nb');\n");
  runMigrations(db, dir);
  assert.equal(db.prepare("SELECT v FROM t").get().v, "a;\nb");
});

test("failing file rolls back and records nothing", () => {
  const { dir, db } = setup();
  write(dir, "001_a.sql", "CREATE TABLE t (id INTEGER);\nALTER TABLE t ADD COLUMN x TEXT;\nALTER TABLE t ADD COLUMN x TEXT;\n");
  assert.throws(() => runMigrations(db, dir), /001_a\.sql/);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM _migrations").get().c, 0);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='t'").get(), undefined);
});

test("edited applied file is detected; escape hatch warns", () => {
  const { dir, db } = setup();
  write(dir, "001_a.sql", "CREATE TABLE t (id INTEGER);\n");
  runMigrations(db, dir);
  runMigrations(db, dir);
  write(dir, "001_a.sql", "CREATE TABLE t (id INTEGER, y TEXT);\n");
  assert.throws(() => runMigrations(db, dir), /modifiée après application/);
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  process.env.MIGRATIONS_ALLOW_CHECKSUM_MISMATCH = "1";
  try {
    runMigrations(db, dir);
  } finally {
    delete process.env.MIGRATIONS_ALLOW_CHECKSUM_MISMATCH;
    console.warn = warn;
  }
  assert.equal(warnings.length, 1);
});

test("NULL checksums are backfilled", () => {
  const { dir, db } = setup();
  write(dir, "001_a.sql", "CREATE TABLE t (id INTEGER);\n");
  db.exec("CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  db.exec("CREATE TABLE t (id INTEGER)");
  db.prepare("INSERT INTO _migrations VALUES ('001_a.sql', 'x')").run();
  runMigrations(db, dir);
  const row = db.prepare("SELECT checksum FROM _migrations").get();
  assert.match(row.checksum, /^[0-9a-f]{64}$/);
});

test("real migrations folder applies to a fresh DB", () => {
  const { db } = setup();
  runMigrations(db, path.join(process.cwd(), "migrations"));
  const count = fs.readdirSync("migrations").filter((f) => f.endsWith(".sql")).length;
  assert.ok(db.prepare("SELECT COUNT(*) c FROM _migrations").get().c >= count);
});
