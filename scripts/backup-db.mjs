#!/usr/bin/env node
// Online SQLite backup via better-sqlite3 db.backup() — safe while the app is
// running (consistent snapshot, subject to SQLite contention). Also archives the
// uploads directory, writes a sha256 manifest, applies retention and optionally
// pushes every artifact offsite with rclone.
//
// Env: DB_PATH, UPLOAD_DIR, BACKUP_DIR (default: <db dir>/backups),
// BACKUP_RETENTION (default 14), BACKUP_RCLONE_REMOTE (optional, e.g. b2:bucket/store).
// rclone credentials stay in rclone's own config/env; nothing secret is logged.

import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.DB_PATH || "./data/crm.db";
const backupsDir = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(path.dirname(path.resolve(dbPath)), "backups");
const uploadDir = path.resolve(
  process.env.UPLOAD_DIR || path.join(path.dirname(path.resolve(dbPath)), "uploads"),
);
const remote = (process.env.BACKUP_RCLONE_REMOTE || "").trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseRetention() {
  const raw = process.env.BACKUP_RETENTION;
  if (raw === undefined || raw === "") return 14;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    fail(`Backup refusé : BACKUP_RETENTION invalide (${raw}), entier >= 1 attendu`);
  }
  return Number(raw);
}

function safeTimestamp() {
  return new Date().toISOString().replace(/:/g, "").replace(/\./g, "-");
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function prune(keep) {
  for (const pattern of [/^crm-.*\.db$/, /^uploads-.*\.tar\.gz$/, /^manifest-.*\.json$/]) {
    const files = fs.readdirSync(backupsDir).filter((n) => pattern.test(n)).sort().reverse();
    for (const stale of files.slice(keep)) {
      fs.unlinkSync(path.join(backupsDir, stale));
      console.log(`Ancien backup supprimé : ${stale}`);
    }
  }
}

function pushOffsite(files) {
  const probe = spawnSync("rclone", ["version"], { stdio: "ignore" });
  if (probe.error) {
    fail("Backup échoué : rclone est introuvable (requis car BACKUP_RCLONE_REMOTE est défini). Installez rclone ou retirez BACKUP_RCLONE_REMOTE.");
  }
  for (const file of files) {
    try {
      execFileSync("rclone", ["copy", file, remote], { stdio: "inherit" });
    } catch {
      fail(`Backup échoué : envoi offsite impossible pour ${path.basename(file)}`);
    }
    console.log(`Offsite OK : ${path.basename(file)}`);
  }
}

async function main() {
  const keep = parseRetention();
  if (!fs.existsSync(dbPath)) fail(`Backup refusé : base introuvable (${dbPath})`);

  // Restrict creation from the outset, including any SQLite sidecars. chmod is
  // also required for an existing directory; mkdir's mode only affects new ones.
  process.umask(0o077);
  fs.mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(backupsDir, 0o700);
  const stamp = safeTimestamp();
  const dest = path.join(backupsDir, `crm-${stamp}.db`);
  const artifacts = [dest];

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
  console.log(`Backup OK : ${dest} (${(fs.statSync(dest).size / 1024).toFixed(1)} Ko)`);

  if (fs.existsSync(uploadDir) && fs.statSync(uploadDir).isDirectory()) {
    const archive = path.join(backupsDir, `uploads-${stamp}.tar.gz`);
    fs.closeSync(fs.openSync(archive, "wx", 0o600));
    try {
      execFileSync("tar", ["-czf", archive, "-C", uploadDir, "."], { stdio: ["ignore", "inherit", "inherit"] });
    } catch (error) {
      fs.unlinkSync(archive);
      throw new Error(`archivage des médias impossible (${error instanceof Error ? error.message : error})`);
    }
    fs.chmodSync(archive, 0o600);
    artifacts.push(archive);
    console.log(`Médias OK : ${archive} (${(fs.statSync(archive).size / 1024).toFixed(1)} Ko)`);
  } else {
    console.warn(`Avertissement : dossier médias introuvable (${uploadDir}), archive ignorée`);
  }

  const manifest = path.join(backupsDir, `manifest-${stamp}.json`);
  const body = {
    createdAt: new Date().toISOString(),
    files: artifacts.map((file) => ({
      name: path.basename(file),
      sha256: sha256(file),
      size: fs.statSync(file).size,
    })),
  };
  fs.writeFileSync(manifest, JSON.stringify(body, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  artifacts.push(manifest);
  console.log(`Manifeste OK : ${manifest}`);

  prune(keep);
  if (remote) pushOffsite(artifacts);
}

main().catch((err) => {
  console.error(`Backup échoué : ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
