import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadSource } from "../test-source.mjs";

const Database = loadSource("better-sqlite3");
const { runMigrations } = loadSource("@/lib/migrate.ts");
const scripts = fileURLToPath(new URL("../", import.meta.url));
const migrationsDir = path.join(scripts, "..", "migrations");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));
  const dbPath = path.join(root, "crm.db");
  const uploads = path.join(root, "uploads");
  const backups = path.join(root, "out");
  fs.mkdirSync(uploads);
  fs.writeFileSync(path.join(uploads, "a.txt"), "hello");
  const db = new Database(dbPath);
  runMigrations(db, migrationsDir);
  db.close();
  const env = {
    PATH: process.env.PATH, DELIVERY_PROVIDER: "mock",
    DB_PATH: dbPath, UPLOAD_DIR: uploads, BACKUP_DIR: backups,
  };
  return { root, env, backups };
}
const run = (script, env, args = []) =>
  spawnSync(process.execPath, [path.join(scripts, script), ...args], { env, encoding: "utf8" });
const list = (dir, re) => fs.readdirSync(dir).filter((n) => re.test(n)).sort();

test("backup creates db, uploads archive and manifest with 0600", () => {
  const { env, backups } = setup();
  const r = run("backup-db.mjs", env);
  assert.equal(r.status, 0, r.stderr);
  const files = fs.readdirSync(backups);
  assert.equal(files.filter((n) => /^crm-.*\.db$/.test(n)).length, 1);
  assert.equal(files.filter((n) => /^uploads-.*\.tar\.gz$/.test(n)).length, 1);
  assert.equal(files.filter((n) => /^manifest-.*\.json$/.test(n)).length, 1);
  for (const f of files) assert.equal(fs.statSync(path.join(backups, f)).mode & 0o777, 0o600, f);
  const manifest = JSON.parse(fs.readFileSync(path.join(backups, list(backups, /^manifest-/)[0]), "utf8"));
  assert.equal(manifest.files.length, 2);
  assert.match(manifest.files[0].sha256, /^[0-9a-f]{64}$/);
});

test("retention prunes oldest artifacts", () => {
  const { env, backups } = setup();
  env.BACKUP_RETENTION = "2";
  for (let i = 0; i < 3; i++) {
    const r = run("backup-db.mjs", env);
    assert.equal(r.status, 0, r.stderr);
  }
  for (const re of [/^crm-.*\.db$/, /^uploads-.*\.tar\.gz$/, /^manifest-.*\.json$/]) {
    assert.equal(list(backups, re).length, 2, String(re));
  }
});

test("invalid retention fails", () => {
  const { env } = setup();
  env.BACKUP_RETENTION = "0";
  assert.notEqual(run("backup-db.mjs", env).status, 0);
});

test("verify passes on a fresh snapshot and fails on a corrupted one", () => {
  const { env, backups } = setup();
  assert.equal(run("backup-db.mjs", env).status, 0);
  const ok = run("verify-backup.mjs", env);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Vérification OK/);

  const snap = path.join(backups, list(backups, /^crm-.*\.db$/)[0]);
  // Corrupted copy without manifest: structural damage must be detected.
  const bad = path.join(backups, "copy.db");
  const buf = fs.readFileSync(snap);
  buf.fill(0xab, 4096, Math.min(buf.length, 4096 * 6));
  fs.writeFileSync(bad, buf);
  assert.notEqual(run("verify-backup.mjs", env, [bad]).status, 0);
  // Corrupt the real snapshot: manifest sha256 mismatch.
  fs.writeFileSync(snap, Buffer.concat([buf, Buffer.from("x")]));
  const r = run("verify-backup.mjs", env);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /sha256/);
});

test("offsite push runs only when remote is set (fake rclone)", () => {
  const { root, env, backups } = setup();
  const bin = path.join(root, "bin");
  const log = path.join(root, "rclone.log");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "rclone"), `#!/bin/sh\necho "$@" >> "${log}"\n`, { mode: 0o755 });
  const withFake = { ...env, PATH: `${bin}:${env.PATH}` };

  assert.equal(run("backup-db.mjs", withFake).status, 0);
  assert.equal(fs.existsSync(log), false);

  fs.rmSync(backups, { recursive: true });
  const r = run("backup-db.mjs", { ...withFake, BACKUP_RCLONE_REMOTE: "fake:bucket/x" });
  assert.equal(r.status, 0, r.stderr);
  const calls = fs.readFileSync(log, "utf8").trim().split("\n").filter((c) => c !== "version");
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.startsWith("copy ") && c.endsWith(" fake:bucket/x")));
});

test("missing rclone exits non-zero with French message", () => {
  const { root, env } = setup();
  const bin = path.join(root, "only-tar");
  fs.mkdirSync(bin);
  for (const tool of ["tar", "gzip"]) {
    const found = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
    fs.symlinkSync(found, path.join(bin, tool));
  }
  const r = run("backup-db.mjs", { ...env, PATH: bin, BACKUP_RCLONE_REMOTE: "fake:b" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /rclone est introuvable/);
});
