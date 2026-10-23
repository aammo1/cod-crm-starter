# Task 35: Documentation, env examples and Compose sync

## Status

pending

## Wave

8

## Description

Bring operator documentation and configuration examples in line with everything this spec added, so a new store copy can be deployed correctly from the docs alone.

## Dependencies

**Depends on:** task-34-code-cleanup.md (and transitively all tasks)
**Blocks:** None

**Context from dependencies:** The spec added:
- Env: `DELIVERY_PROVIDER` required in production (`mock`|`ozon`), `SECURITY_TRUSTED_IP_HEADER` or `SECURITY_ACCEPT_GLOBAL_BUDGETS=1` required in production, `MIGRATIONS_ALLOW_CHECKSUM_MISMATCH` (recovery only), `HEALTH_DETAILS_TOKEN`, `LOG_FORMAT`, `BACKUP_DIR`, `BACKUP_RETENTION`, `BACKUP_RCLONE_REMOTE`, TikTok vars passed through Compose (task 04 already added some to `docker-compose.yml`/`.env.example` — verify completeness).
- Boot: `src/lib/env.ts` fail-fast validation; worker DB lease (one owner per DB, 90 s TTL).
- Health: public `{status}` only; details with `Authorization: Bearer $HEALTH_DETAILS_TOKEN`; `degraded` on stale workers.
- Migrations: checksums in `_migrations`; no error swallowing.
- Backups: `npm run backup` (DB + uploads + manifest, retention, optional rclone), `npm run backup:verify`, `deploy/backup/*` cron/systemd examples.
- CI: `test:unit`, nightly `release` job, `docker` smoke job, Dependabot.
- Features: delivery outcomes (Livré/Refusé), blocklist, extended history, UTM attribution, variant cost, ad spend, COD remittances (CSV import), city tariffs, auto-assignment, leads (opt-in), KPIs, CSV export, `/suivi` tracking page, consent banner modes, Snap pixel, `accentForeground`, wizard `.template-version`.
- Migrations 020–027.

## Files to Modify

- `docs/operations.md` — production checklist (env table, proxy IP header, mock warning, health token), backups (schedule, offsite, restore drill), migrations checksum recovery procedure, Ozon status verification as a **launch blocker** for automatic outcomes (manual Livré/Refusé until then), COD reconciliation workflow, leads/consent legal notes.
- `docs/template-upgrades.md` — how to apply this spec to existing copies (migrations 020–027 order, env changes, `.template-version`), and the Next internals assertion test.
- `docs/storefront-integration.md` — note that UTM attribution is in-repo only; v1 unchanged.
- `examples/nextjs/README.md` — document the example limiter's global-only behavior without a trusted IP and recommend proxy rate limiting.
- `.env.example`, `docker-compose.yml` — every variable above, commented, no real values.
- `README.md` — feature list and commands (`test:unit`, `backup:verify`).
- `AGENTS.md` — add new commands (`npm run test:unit`, `npm run backup:verify`) to the Commands section and note the new services (`delivery-outcomes`, `customers`, `ad-spend`, `cod-remittances`, `city-tariffs`, `assignment`, `kpis`, `checkout-leads`) in the ownership list. Keep existing invariants verbatim.
- Rename `.env.production.example` only if it is tracked by git (`git ls-files .env.production.example`); if untracked, leave it alone and add a note in `docs/operations.md` that production env files must never be committed.

## Acceptance Criteria

- [ ] Every env var read in `src/` (`grep -rhoE "process\.env\.[A-Z0-9_]+" src | sort -u`) is documented in `.env.example` or explicitly marked internal.
- [ ] `docker compose config` validates (if Docker is available) with required vars set.
- [ ] `npm run test:release-tree` passes (docs included as intended).
- [ ] No secrets or real values in docs.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
