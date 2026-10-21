# AGENTS.md — COD CRM Starter (provisional extraction)

Work only in `/home/tal7a/Projects/cod-crm-starter`. The Zehri source workspace
is read-only. Feature context: `specs/cod-crm-starter/requirements.md` and its
task files. This is a CRM-only, single-store deployment, with independent users,
SQLite, media and credentials per repository. Task 01 is an extraction baseline;
generic catalog, store configuration and storefront v1 are subsequent work.

## Commands
- `npm install`
- `npm run dev`
- `npm run lint` and `npx tsc --noEmit` — required before finishing each task
- `npm run build` — standalone production output
- `npm run start` — local production verification (`node .next/standalone/server.js` for standalone deployment)
- `npm run test:crm`, `npm run test:catalog-agent`, `npm run test:security`,
  `npm run test:meta`, `npm run test:assistant` — adapt fixtures alongside their owning tasks
- `node scripts/create-user.mjs <email> <password> <name> <admin|agent>` — explicit first-user creation
- `npm run backup` — online SQLite backup

## Ownership
- `migrations/`: auto-applied SQL and `_migrations`; new database lineage, no source DB migration.
- `src/lib/services/inventory.ts`: ALL physical/reserved/quarantine stock writes and ledger.
- `src/lib/services/`: catalog, orders, confirmation, fulfillment, returns,
  team, order edits/history/lifecycle, dashboard, optional assistant/catalog/Meta.
- `src/lib/shipping/`: provider interface, mock/Ozon adapter, redaction, status map and policy.
- `src/lib/workers/`: submission, tracking, optional Meta; started by instrumentation.
- `src/app/(admin)/`: login, admin catalog, CRM including team and manual orders.
- `src/app/api/`: authenticated operational APIs, media, health and transitional
  orders/Pixel endpoints. No storefront UI or browser Pixel mounting.
- `src/components/{ui,admin,crm}/`: existing design system, mobile ergonomics and team UI.
- `src/stores/assistant-context.ts`: retained assistant state only.
- `docs/extraction-manifest.md`: exact extraction boundaries and adaptation inventory.

## Invariants
- Server recomputes prices. Persist orders and durable side effects before success.
- Confirmation atomically closes pending upsells, reserves stock and queues submission.
  Contact logs never reopen confirmed/cancelled orders.
- Only inventory service writes stock; preserve race protection and history references.
- Parcel creation only by submission worker, tracking only by poller; BL/handoff
  are explicit agent actions. Durable BL claims and recorded portal reconciliation
  are required for uncertain steps; no blind retries or automatic lease takeover.
- Redact every Ozon credential-bearing URL from logs/errors/browser.
- Unknown tracking statuses never automatically change stock. Unverified mappings stay unverified.
- Preserve admin/agent permissions and existing CRM usability/team features.
- Visible copy French, integer MAD prices; discounts only in upsell flow.
- Never reintroduce Google Sheets/WEBHOOK_URL.
- All verification uses `DELIVERY_PROVIDER=mock`, isolated temporary DB/media and
  ephemeral test credentials. Never load source env files or call live couriers.
- No boot-time product/user/order seeds. Defaults are target-local `data/crm.db`
  and `data/uploads`; persistent `/app/data` for containers.
- Secrets runtime-only, never committed or included in public responses. Optional
  assistant/catalog/Meta remain disabled when unconfigured.
- Configure `SECURITY_ALLOWED_ORIGINS` explicitly for browser mutations at the
  deployment's origin; never trust caller Host headers to grant access.

Do not publish, commit or mark spec tasks complete unless the orchestrator/user
explicitly requests it. Do not sync changes back to the source or global skills.
