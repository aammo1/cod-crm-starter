#!/usr/bin/env node
// Restore check for a SQLite snapshot made by backup-db.mjs. Works on a temp copy;
// never opens the live database. Usage: node scripts/verify-backup.mjs [snapshot.db]
// Env: BACKUP_DIR / DB_PATH (to locate the newest snapshot when no argument).

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

function fail(message) {
  console.error(`Vérification ÉCHOUÉE : ${message}`);
  process.exit(1);
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function findSnapshot() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const dir = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.join(path.dirname(path.resolve(process.env.DB_PATH || "./data/crm.db")), "backups");
  if (!fs.existsSync(dir)) fail(`dossier de backups introuvable (${dir})`);
  const newest = fs.readdirSync(dir).filter((n) => /^crm-.*\.db$/.test(n)).sort().pop();
  if (!newest) fail(`aucun snapshot crm-*.db dans ${dir}`);
  return path.join(dir, newest);
}

function main() {
  const snapshot = findSnapshot();
  if (!fs.existsSync(snapshot)) fail(`snapshot introuvable (${snapshot})`);
  const name = path.basename(snapshot);

  const stamp = /^crm-(.*)\.db$/.exec(name)?.[1];
  const manifestPath = stamp ? path.join(path.dirname(snapshot), `manifest-${stamp}.json`) : null;
  if (manifestPath && fs.existsSync(manifestPath)) {
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      fail("manifeste illisible");
    }
    for (const entry of manifest.files ?? []) {
      const file = path.join(path.dirname(snapshot), entry.name);
      if (!fs.existsSync(file)) {
        if (entry.name === name) fail("snapshot absent du dossier");
        console.warn(`Avertissement : ${entry.name} listé au manifeste mais absent`);
        continue;
      }
      if (sha256(file) !== entry.sha256) fail(`sha256 différent pour ${entry.name}`);
    }
    console.log("Manifeste : sha256 conforme");
  } else {
    console.warn("Avertissement : pas de manifeste, sha256 non vérifié");
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-backup-"));
  try {
    const copy = path.join(tmp, "restore.db");
    fs.copyFileSync(snapshot, copy);
    let db;
    try {
      db = new Database(copy, { readonly: true, fileMustExist: true });
    } catch (error) {
      fail(`ouverture impossible (${error instanceof Error ? error.message : error})`);
    }
    try {
      let integrity;
      try {
        integrity = db.pragma("integrity_check", { simple: true });
      } catch (error) {
        fail(`integrity_check impossible (${error instanceof Error ? error.message : error})`);
      }
      if (integrity !== "ok") fail(`integrity_check = ${integrity}`);
      const fk = db.pragma("foreign_key_check");
      if (fk.length > 0) fail(`foreign_key_check : ${fk.length} violation(s)`);

      const expected = fs.readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).length;
      const applied = db.prepare("SELECT COUNT(*) AS c FROM _migrations").get().c;
      if (applied !== expected) fail(`migrations appliquées ${applied} != fichiers ${expected}`);

      const orders = db.prepare("SELECT COUNT(*) AS c FROM orders").get().c;
      const products = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
      console.log(`Vérification OK : ${name}`);
      console.log(`  intégrité : ok, clés étrangères : ok, migrations : ${applied}/${expected}`);
      console.log(`  commandes : ${orders}, produits : ${products}`);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
