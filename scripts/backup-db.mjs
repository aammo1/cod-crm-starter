#!/usr/bin/env node
// Online SQLite backup via better-sqlite3 db.backup() — safe while the app is
// running (consistent snapshot, subject to SQLite contention). Keeps 14 snapshots.

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

  // Restrict creation from the outset, including any SQLite sidecars. chmod is
  // also required for an existing directory; mkdir's mode only affects new ones.
  process.umask(0o077);
  fs.mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(backupsDir, 0o700);
  const dest = path.join(backupsDir, `crm-${safeTimestamp()}.db`);

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    // Exclusive creation prevents overwriting an existing snapshot or following
    // a destination symlink. Set permissions BEFORE SQLite can write any data.
    const fd = fs.openSync(dest, "wx", 0o600);
    fs.closeSync(fd);
    try {
      await db.backup(dest);
    } catch (error) {
      fs.unlinkSync(dest);
      throw error;
    }
  } finally {
    db.close();
  }

  const size = fs.statSync(dest).size;
  console.log(`Backup OK : ${dest} (${(size / 1024).toFixed(1)} Ko)`);

  const backups = fs
    .readdirSync(backupsDir)
    .filter((name) => /^crm-.*\.db$/.test(name))
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
