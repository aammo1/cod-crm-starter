import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

// Matches SQLite's duplicate-object errors ("table X already exists",
// "duplicate column name: X", "index ... already exists"). These are expected
// when a migration file was partially applied before a crash, so the runner
// skips them instead of failing startup.
const ALREADY_APPLIED = /already exists|duplicate column/i;

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  for (const line of sql.split("\n")) {
    current.push(line);
    if (line.trimEnd().endsWith(";")) {
      const statement = current.join("\n").trim();
      if (statement) statements.push(statement);
      current = [];
    }
  }
  const rest = current.join("\n").trim();
  if (rest) statements.push(rest);
  return statements;
}

export function runMigrations(db: Database.Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );

  const dir = path.join(process.cwd(), "migrations");
  if (!fs.existsSync(dir)) return;

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length === 0) return;

  const applied = new Set(
    (
      db.prepare("SELECT name FROM _migrations").all() as Array<{ name: string }>
    ).map((row) => row.name),
  );
  const record = db.prepare(
    "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    db.transaction(() => {
      for (const statement of splitStatements(sql)) {
        try {
          db.exec(statement);
        } catch (error) {
          if (ALREADY_APPLIED.test(String(error))) continue;
          throw error;
        }
      }
      record.run(file, new Date().toISOString());
    })();
  }
}