import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function runMigrations(
  db: Database.Database,
  dir: string = path.join(process.cwd(), "migrations"),
): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  // Runner-owned metadata, not a migration file.
  const columns = db.prepare("PRAGMA table_info(_migrations)").all() as Array<{
    name: string;
  }>;
  if (!columns.some((column) => column.name === "checksum")) {
    db.exec("ALTER TABLE _migrations ADD COLUMN checksum TEXT");
  }

  if (!fs.existsSync(dir)) return;

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length === 0) return;

  const applied = new Map(
    (
      db.prepare("SELECT name, checksum FROM _migrations").all() as Array<{
        name: string;
        checksum: string | null;
      }>
    ).map((row) => [row.name, row.checksum]),
  );
  const record = db.prepare(
    "INSERT INTO _migrations (name, applied_at, checksum) VALUES (?, ?, ?)",
  );
  const backfill = db.prepare(
    "UPDATE _migrations SET checksum = ? WHERE name = ? AND checksum IS NULL",
  );
  const allowMismatch = process.env.MIGRATIONS_ALLOW_CHECKSUM_MISMATCH === "1";

  for (const file of files) {
    const bytes = fs.readFileSync(path.join(dir, file));
    const checksum = sha256(bytes);

    if (applied.has(file)) {
      const stored = applied.get(file);
      if (stored == null) {
        backfill.run(checksum, file);
      } else if (stored !== checksum) {
        const message = `Migration ${file} modifiée après application (checksum différent). Restaurez le fichier d'origine.`;
        if (!allowMismatch) throw new Error(message);
        console.warn(`[migrate] ${message} (MIGRATIONS_ALLOW_CHECKSUM_MISMATCH=1)`);
      }
      continue;
    }

    try {
      db.transaction(() => {
        db.exec(bytes.toString("utf8"));
        record.run(file, new Date().toISOString(), checksum);
      })();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} échouée : ${reason}`, { cause: error });
    }
  }
}
