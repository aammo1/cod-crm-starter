#!/usr/bin/env node
// Online SQLite backup via better-sqlite3 db.backup() — safe while the app is
// running (no locks, consistent snapshot). Keeps the last KEEP_BACKUPS files.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const KEEP_BACKUPS = 14;

const dbPath = process.env.DB_PATH || "./data/crm.db";
const backupsDir = path.join(path.dirname(path.resolve(dbPath)), "backups");

function safeTimestamp() {
  return new Date().toISOString().replace(/:/g, "").replace(/\./g, "-");
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`Backup refusé : base introuvable (${dbPath})`);
    process.exit(1);
  }

  fs.mkdirSync(backupsDir, { recursive: true });
  const dest = path.join(backupsDir, `zehri-${safeTimestamp()}.db`);

  const db = new Database(dbPath);
  try {
    await db.backup(dest);
  } finally {
    db.close();
  }

  const size = fs.statSync(dest).size;
  console.log(`Backup OK : ${dest} (${(size / 1024).toFixed(1)} Ko)`);

  const backups = fs
    .readdirSync(backupsDir)
    .filter((name) => /^zehri-.*\.db$/.test(name))
    .sort()
    .reverse();
  for (const stale of backups.slice(KEEP_BACKUPS)) {
    fs.unlinkSync(path.join(backupsDir, stale));
    console.log(`Ancien backup supprimé : ${stale}`);
  }
}

main().catch((err) => {
  console.error(`Backup échoué : ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
