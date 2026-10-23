#!/usr/bin/env node
// Ozon Express — read-only live verification (task-14).
//
// ⚠️  NE PAS EXÉCUTER sans l'autorisation explicite du propriétaire
// (docs/operations.md, activation Ozon). Ce script effectue de VRAIS
// appels réseau vers l'API Ozon. Il est volontairement gardé derrière les
// drapeaux --live et --yes et la présence des identifiants dans l'environnement.
//
// Opérations effectuées (lecture seule, aucune création de colis) :
//   1. GET  /cities                              → comparaison avec la table `cities`
//   2. POST /customers/{id}/{key}/tracking       → code bidon (schéma de réponse)
//   3. Optionnel (--code OZE...) : tracking + parcel-info sur un vrai code
//
// Usage:
//   OZON_CLIENT_ID=... OZON_API_KEY=... node scripts/ozon-verify.mjs --live --yes
//   OZON_CLIENT_ID=... OZON_API_KEY=... node scripts/ozon-verify.mjs --live --yes --code OZE123456789
//
// Sortie: corps JSON bruts observés — conserver hors du dépôt public, expurgés
// après vérification. Les identifiants ne sont JAMAIS affichés.

import fs from "node:fs";

const TIMEOUT_MS = 15_000;
const BOGUS_CODE = "OZE000000000";
const BODY_PREVIEW_MAX = 4000;

const usage = `
Usage (LECTURE SEULE — autorisation propriétaire requise):
  OZON_CLIENT_ID=... OZON_API_KEY=... node scripts/ozon-verify.mjs --live --yes [--code OZE...]

Options:
  --live       Garde explicite : confirme qu'il s'agit d'appels réseau réels.
  --yes        Confirmation explicite : effectue réellement les appels réseau.
  --code CODE  Code de suivi réel (colis test autorisé) : ajoute tracking + parcel-info.
`.trim();

// Charge .env.local (KEY=VALUE) sans jamais afficher les valeurs.
function loadEnvLocal() {
  try {
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    // Pas de .env.local — seules les variables d'environnement comptent.
  }
}

function redactUrl(url) {
  return url.replace(/\/customers\/[^/?#\s]*\/[^/?#\s]*/g, "/customers/***/***");
}

function preview(text) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > BODY_PREVIEW_MAX ? `${clean.slice(0, BODY_PREVIEW_MAX)}…` : clean;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }
  if (!args.includes("--live")) {
    console.error("ATTENTION : ce script effectue de VRAIS appels réseau vers l'API Ozon (lecture seule).");
    console.error("Refusé : relancez avec --live (et --yes) après autorisation explicite du propriétaire.");
    process.exit(1);
  }
  if (!args.includes("--yes")) {
    console.error("Refusé : ce script effectue de vrais appels Ozon. Relancez avec --yes après autorisation du propriétaire.");
    process.exit(1);
  }

  await loadEnvLocal();
  const clientId = process.env.OZON_CLIENT_ID;
  const apiKey = process.env.OZON_API_KEY;
  if (!clientId || !apiKey) {
    console.error("Refusé : OZON_CLIENT_ID / OZON_API_KEY absents de l'environnement (ou .env.local).");
    process.exit(1);
  }

  const baseUrl = (process.env.OZON_BASE_URL || "https://api.ozonexpress.ma").replace(/\/+$/, "");
  const op = (name) => `${baseUrl}/customers/${clientId}/${apiKey}/${name}`;

  console.log("=== Vérification Ozon LIVE (lecture seule) ===");
  console.log(`Base: ${redactUrl(baseUrl)}`);

  // 1. Cities (endpoint non authentifié, hors chemin client)
  try {
    const res = await fetch(`${baseUrl}/cities`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    console.log(`\n--- GET /cities → HTTP ${res.status}`);
    console.log(preview(text));
  } catch (err) {
    console.error(`\n--- GET /cities → échec : ${err?.message ?? err}`);
  }

  // 2. Tracking sur un code bidon — révèle la forme de la réponse
  try {
    const res = await fetch(op("tracking"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "tracking-number": [BOGUS_CODE] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    console.log(`\n--- POST tracking (code bidon ${BOGUS_CODE}) → HTTP ${res.status}`);
    console.log(preview(text));
  } catch (err) {
    console.error(`\n--- POST tracking (code bidon) → échec : ${err?.message ?? err}`);
  }

  // 3. Optionnel : code réel autorisé — tracking + parcel-info
  const codeIndex = args.indexOf("--code");
  const realCode = codeIndex !== -1 ? args[codeIndex + 1] : undefined;
  if (realCode) {
    try {
      const res = await fetch(op("tracking"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "tracking-number": [realCode] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      console.log(`\n--- POST tracking (code réel) → HTTP ${res.status}`);
      console.log(preview(text));
    } catch (err) {
      console.error(`\n--- POST tracking (code réel) → échec : ${err?.message ?? err}`);
    }
    try {
      const form = new FormData();
      form.append("tracking-number", realCode);
      const res = await fetch(op("parcel-info"), {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      console.log(`\n--- POST parcel-info (code réel) → HTTP ${res.status}`);
      console.log(preview(text));
    } catch (err) {
      console.error(`\n--- POST parcel-info (code réel) → échec : ${err?.message ?? err}`);
    }
  } else {
    console.log("\n(code réel non fourni — étape tracking/parcel-info réelle ignorée)");
  }

  console.log("\n=== Fin — conserver les observations expurgées hors du dépôt et vérifier STATUS_MAP (docs/operations.md) ===");
}

main().catch((err) => {
  console.error(`Erreur inattendue : ${err?.message ?? err}`);
  process.exit(1);
});
