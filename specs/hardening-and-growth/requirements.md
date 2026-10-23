# Requirements: Hardening and Growth

## Summary

A four-part read-only audit (security, order/inventory integrity, storefront/SEO/conversion, operations) of the Store CRM Boilerplate found no critical security issue, but found real money-affecting bugs at the edges (pack pricing with mixed variant prices, order edits repricing untouched lines and keeping stale pack discounts, manual orders ignoring packs, browser/server phone validation mismatch, idempotency key rotation after an uncertain checkout), availability weaknesses (one bot can exhaust the global checkout/login budgets when no trusted IP header is configured), operational gaps (migration runner swallowing errors, no fail-fast env validation, mock courier default in the image, health that never reports stalls, no single-process enforcement, local-only manual backups, partial CI) and missing COD business features (blocklist, delivery outcomes, COD remittance, UTM attribution, profitability dashboard, CSV export, auto-assignment, per-city tariffs, abandoned checkout leads, order tracking page, consent and Snap pixel).

This spec fixes every confirmed defect, hardens the template for live use, and adds the missing operator features — while preserving every invariant in `AGENTS.md` (server-authoritative MAD prices, transactional receipts and stable attempt keys, inventory service as sole stock writer, storefront reading only cached loaders, no build-time DB access, French CRM, fr/ar storefront, mock-only verification).

Expected outcome: a template copy can go live with correct totals in every flow, fails fast when misconfigured, survives a single abusive client, exposes useful health and logs, has restorable offsite backups, and gives the operator the numbers (confirmation/delivery rates, profit, ROAS, cash remitted) needed to run a Moroccan COD business.

## Goals

- Every order total (checkout, upsell, manual order, agent edit) is correct for packs and mixed variant prices.
- Shopper phone input in any common Moroccan form (06/07, +212, 00212, +212 0…, Arabic-Indic digits) is accepted identically by browser and server.
- An uncertain checkout can never produce a duplicate order via key rotation.
- Production boot fails fast on missing/unsafe configuration; mock courier in production is impossible to miss.
- One abusive client cannot block all checkouts or logins once the documented production setting is applied.
- Health reports stalled workers; errors are structured and recorded per worker.
- Migrations fail loudly and detect edits to applied files.
- Agents can record delivery outcomes; the CRM knows delivered/refused per order and per customer.
- Operator features: phone blocklist, extended customer history, UTM attribution, product cost, ad spend, COD remittance, per-city courier cost/fee override, auto-assignment, CSV export, abandoned checkout leads, KPI dashboard, customer tracking page, consent banner, Snap pixel.
- SEO/a11y/RTL polish and a robust new-store wizard.

## Non-Goals

- A second live courier adapter (needs a chosen courier and verified API docs — see action-required.md). Only Ozon + mock remain.
- Filling `STATUS_MAP` in `src/lib/shipping/status-map.ts` with Ozon strings. Verified mappings may only be added after live observation by the owner; this spec adds a manual agent outcome path instead.
- Snapchat Conversions API (server-side). Only the browser Snap Pixel is added.
- Multi-tenant or shared state between store copies; automatic template update propagation.
- Switching SQLite `synchronous` from FULL; rewriting applied migrations; changing the `LIKE` phone search to an index-backed search.
- Browser Purchase event value including the upsell (left as is; eventID dedup is correct).
- Upgrading to Next 16 / zod 4 / next-auth stable.
- A customer account/login system.

## Acceptance Criteria

- [ ] All defects listed in the task files are fixed with regression tests (unit tests under `scripts/unit/`, or extensions of existing `scripts/*.test.mjs` suites).
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test`, `DELIVERY_PROVIDER=mock npm run build`, `npm run perf-budget` (≤ 122,880 B gzip-9) and `npm run test:bootstrap` pass.
- [ ] No storefront client bundle includes zod, libphonenumber-js, DB or service modules.
- [ ] All new CRM UI copy is French; all new storefront copy exists in both `fr` and `ar` in `src/config/i18n.ts`; RTL layouts remain correct.
- [ ] New migrations `020`–`027` apply cleanly on a fresh DB and on a DB at `019`.
- [ ] Admin/agent permissions are enforced on every new route (`requireUser` / `requireAdmin`, origin check by middleware, body size limits).
- [ ] `docs/operations.md`, `.env.example` and `docker-compose.yml` document every new env var and operational procedure.

## Assumptions

- Each store copy runs one Node process per SQLite DB behind a reverse proxy (Coolify/Traefik/Caddy/nginx) that can set a client IP header.
- The owner will verify Ozon tracking statuses live later; until then delivery outcomes are agent-declared.
- Ozon remittance statements can be exported (CSV) with at least tracking number and amount; exact column names are configurable at import time.
- Product cost and ad spend are entered by an admin (no ad-platform API integration).

## Technical Constraints

- Next.js 15.5 App Router, React 19, better-sqlite3, Auth.js v5 beta, zod 3, Tailwind; Node 22+.
- Reserved migration numbers (never reuse, never edit applied files): `020_delivery_outcomes`, `021_customer_blocklist`, `022_variant_cost`, `023_ad_spend`, `024_order_attribution`, `025_cod_remittances`, `026_city_tariffs`, `027_checkout_leads`.
- `src/lib/services/inventory.ts` remains the sole writer of stock and ledger.
- Storefront pages read only through `src/lib/storefront/data.ts`; they never call `cookies()/headers()/auth()/connection()` or import `@/lib/db`/services. Every route that changes catalog/prices/packs/settings/availability calls `revalidateStorefront()`.
- Build never opens SQLite.
- Unit tests live in `scripts/unit/*.test.mjs`, load TS via `loadSource` from `scripts/test-source.mjs`, use a temp `DB_PATH` from `fs.mkdtempSync`, `DELIVERY_PROVIDER=mock`, and run under `NODE_OPTIONS=--import=<abs>/scripts/block-external-network.mjs`. Task 11 adds `npm run test:unit` (glob) to `npm test`.
- Do not commit, publish, or mark spec tasks complete unless explicitly asked.
