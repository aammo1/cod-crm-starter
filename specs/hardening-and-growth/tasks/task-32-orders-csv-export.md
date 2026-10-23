# Task 32: Orders CSV export

## Status

complete

## Wave

5

## Description

Operators need to export orders for accounting, courier disputes and ad-platform offline conversions. Add an admin-only CSV export of the orders list honoring the current filters, with formula-injection-safe cells and UTF-8 BOM for Excel.

## Dependencies

**Depends on:** task-12-delivery-outcomes.md, task-21-customer-blocklist-history.md, task-26-utm-attribution.md, task-27-cod-remittance.md
**Blocks:** None

**Context from dependencies:** Task 12 added `delivery_outcome` columns; task 21 added `blocked_phones`; task 26 added UTM columns and list filters `utmSource`, `utmCampaign` in `listOrders` (`src/lib/services/orders.ts`); task 27 created `src/lib/csv.ts` with `escapeCsvCell` (prefixes `'` for cells starting with `= + - @`, tab, CR) and RFC 4180 quoting, and added `cod_status`/`cod_paid_at` usage.

## Files to Create

- `src/lib/services/order-export.ts` — builds rows by reusing `listOrders` filter options (call it with a high page size in a loop, or factor its WHERE builder — do **not** modify `orders.ts`; task 29 edits it in this wave). If reuse is impossible without editing `orders.ts`, write a dedicated read-only query here that mirrors the same filters.
- `src/app/api/crm/orders/export/route.ts` — `GET` with the same query params as the orders page; `requireAdmin`; streams `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="commandes-YYYY-MM-DD.csv"`, `Cache-Control: no-store`.

## Files to Modify

- `src/app/(admin)/crm/orders/page.tsx` — `Exporter CSV` link (admin only) preserving current search params.

## Technical Details

- Columns (French headers): `Référence, Date (Casablanca), Client, Téléphone, Ville, Adresse, Articles, Quantité, Sous-total, Remise, Livraison, Total, Statut confirmation, Agent, Statut colis, N° suivi, Résultat livraison, Date résultat, Statut COD, Payé le, Source, utm_source, utm_medium, utm_campaign, utm_content, Bloqué`.
- Delimiter `;` (Excel default for French locales), UTF-8 BOM prefix, no `sep=` line.
- Max 50,000 rows; beyond that return 413 `Trop de lignes : affinez les filtres.`
- Dates formatted with `formatCasablanca`.
- Log an audit line via `console.info` (or the logger from `src/lib/log.ts` if present) with admin id and row count — no PII in logs.

## Acceptance Criteria

- [ ] Export respects filters and contains the columns above.
- [ ] Cells like `=HYPERLINK(...)` are neutralized.
- [ ] Agents get 403 and don't see the button.
- [ ] Opens correctly in Excel/LibreOffice with accents (BOM).
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
