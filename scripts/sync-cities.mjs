#!/usr/bin/env node
import Database from "better-sqlite3";

const baseUrl = (process.env.OZON_BASE_URL || "https://api.ozonexpress.ma").replace(/\/+$/, "");
const dbPath = process.env.DB_PATH || "./data/crm.db";

async function main() {
  console.log(`Récupération des villes depuis ${baseUrl}/cities...`);
  const response = await fetch(`${baseUrl}/cities`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  const rawList = data?.CITIES
    ? Object.values(data.CITIES)
    : Array.isArray(data)
      ? data
      : [];
  if (!rawList.length) {
    throw new Error("Aucune ville trouvée dans la réponse.");
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO cities (id, name, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
  `);

  let count = 0;
  db.transaction(() => {
    for (const item of rawList) {
      const id = item?.ID ?? item?.id ?? item?.city_id;
      const name = item?.NAME ?? item?.name ?? item?.city_name;
      if (id && name) {
        upsert.run(Number(id), String(name).trim(), now);
        count++;
      }
    }
  })();

  db.close();
  console.log(`Synchronisation réussie : ${count} villes enregistrées dans ${dbPath}.`);
}

main().catch((err) => {
  console.error("Erreur de synchronisation :", err.message);
  process.exit(1);
});
