import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import Database from "better-sqlite3";

function genId(length = 12) {
  return randomBytes(length).toString("base64url").slice(0, length);
}

const usage = `Usage: node scripts/create-user.mjs <email> <password> <name> <admin|agent>
Mot de passe : entre 12 et 128 caractères.
Exemple: node scripts/create-user.mjs admin@example.test '<mot-de-passe-12-caracteres-minimum>' 'Administrateur' admin`;

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function splitStatements(sql) {
  const statements = [];
  let current = [];
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

// Mirrors src/lib/migrate.ts so the script works on a fresh DB before the
// app has ever run (only touches migrations not yet recorded in _migrations).
function applyMigrations(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const dir = path.join(process.cwd(), "migrations");
  if (!fs.existsSync(dir)) throw new Error(`Répertoire de migrations introuvable : ${dir}`);

  const applied = new Set(
    db.prepare("SELECT name FROM _migrations").all().map((row) => row.name),
  );
  const record = db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)");

  for (const file of fs.readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    db.transaction(() => {
      for (const statement of splitStatements(sql)) {
        try {
          db.exec(statement);
        } catch (error) {
          if (!/already exists|duplicate column/i.test(String(error))) throw error;
        }
      }
      record.run(file, new Date().toISOString());
    })();
  }
}

const [emailArg, password, nameArg, role] = process.argv.slice(2);
if (!emailArg || !password || !nameArg || !role) {
  console.error(usage);
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Email invalide (format incorrect ou dépasse 254 caractères).");
  process.exit(1);
}
const name = nameArg.trim();
if (!name || name.length > 120) {
  console.error("Nom invalide : entre 1 et 120 caractères attendu.");
  process.exit(1);
}
if (password.length < 12 || password.length > 128) {
  console.error("Le mot de passe doit contenir entre 12 et 128 caractères.");
  process.exit(1);
}
if (role !== "admin" && role !== "agent") {
  console.error("Rôle invalide : 'admin' ou 'agent' attendu.");
  process.exit(1);
}

const dbPath = process.env.DB_PATH || "./data/crm.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

try {
  applyMigrations(db);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, is_active, session_version, created_at)
     VALUES (?, ?, ?, ?, ?, 1, 0, ?)
     ON CONFLICT(email) DO UPDATE SET
       password_hash = excluded.password_hash,
       name = excluded.name,
       role = excluded.role,
       is_active = 1,
       session_version = users.session_version + 1`,
  ).run(`user_${genId(12)}`, email, hashPassword(password), name, role, new Date().toISOString());
  console.log(`Utilisateur enregistré : ${email} (${role}) — ${dbPath}`);
} finally {
  db.close();
}
