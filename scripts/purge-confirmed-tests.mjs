#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { purgeConfirmedTests } from "../src/lib/services/inventory-test-cleanup.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--apply", "--allow-later-stock-counts"].includes(arg) && !arg.startsWith("--orders=")) ||
    args.filter((arg) => arg.startsWith("--orders=")).length !== 1) {
    throw new Error("Usage : node scripts/purge-confirmed-tests.mjs --orders=ord_ID1,ord_ID2 [--allow-later-stock-counts] [--apply]");
  }
  const ids = args.find((arg) => arg.startsWith("--orders=")).slice(9).split(",");
  const apply = args.includes("--apply");
  const allowLaterStockCounts = args.includes("--allow-later-stock-counts");
  const dbPath = path.resolve(process.env.DB_PATH || "./data/crm.db");
  const db = new Database(dbPath, { fileMustExist: true });
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 10000");
  try {
    // Validate before creating a backup; revalidate under the write lock before deletion.
    const preview = purgeConfirmedTests(db, ids, { allowLaterStockCounts });
    console.log("Aperçu :", JSON.stringify(preview, null, 2));
    if (!apply) {
      console.log("Aucun changement. Ajoutez --apply pour exécuter après vérification.");
      return;
    }
    const dir = path.join(path.dirname(dbPath), "backups");
    fs.mkdirSync(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = path.join(dir, `before-test-purge-${timestamp}.db`);
    await db.backup(backup);
    console.log("Backup OK :", backup);
    const result = purgeConfirmedTests(db, ids, { apply: true, allowLaterStockCounts });
    console.log("Nettoyage terminé :", JSON.stringify(result, null, 2));
    console.log("Commandes restantes :", db.prepare("SELECT COUNT(*) AS n FROM orders").get().n);
  } finally { db.close(); }
}

main().catch((error) => { console.error("Nettoyage refusé :", error.message); process.exitCode = 1; });
