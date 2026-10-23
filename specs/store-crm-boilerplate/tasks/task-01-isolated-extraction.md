# Task 01: Bootstrap an isolated CRM project

## Status
complete

## Wave
1

## Description

Create the standalone CRM-only starter that will become public `aammo1/cod-crm-starter`. Each Moroccan COD store will have an independent CRM/database connected to a custom storefront. Source is `/home/tal7a/Projects/zehri`; target is `/home/tal7a/Projects/cod-crm-starter`. Source code, Git history, databases and production deployments must remain untouched.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-02-generic-schema.md, task-03-store-configuration.md; all later tasks use the target workspace.

**Context from dependencies:** None. Zehri currently combines storefront and CRM in a Next.js 15 App Router/React 19/TypeScript project, Auth.js credentials/admin-agent roles, better-sqlite3, migrations 001–015, uploads, Ozon workers and a shared UI kit. This task bootstraps a separate working application before generic-model work begins.

## Files to Create

- Target project allowlisted source/configuration tree and independent `.git` repository.
- Target `docs/extraction-manifest.md` — included/omitted paths and transitional dependencies.
- Target provisional `AGENTS.md` — correct working directory, operational invariants, verification commands and ownership rules.

## Files to Modify

- Target `package.json`/lockfile, `src/app/layout.tsx`, root page/metadata and copied configuration as needed for CRM-only startup. No source files.

## Technical Details

1. Read source `AGENTS.md`; verify `/home/tal7a/Projects` exists using directory tooling before creation. If the target already exists, inspect and report conflicts; do not delete or overwrite unrelated work. Initialize a fresh Git repo with **no inherited remote/history**. Do not create GitHub yet.
2. Copy an explicit allowlist of application code: admin/login/CRM routes, admin/CRM/auth/media/health/catalog-agent API routes, shared libraries/services, shipping/workers, auth/middleware, migrations, UI/admin/CRM components and relevant operational scripts. Retain backend Meta, optional assistant and catalog-agent dependencies. Keep any non-UI helper still needed until its owner adapts it. Inventory copied runtime assets (fonts/icons); only include neutral or runtime-essential assets.
3. Exclude `.git`, `.env.local`/real env files, `.next`, `node_modules`, SQLite/data/backups, customer/order exports, user uploads, source `public` product photos, audit/browser artifacts and source marketing/spec assets. Never use a blind directory/archive copy. Retain `.env.example` with empty placeholders only.
4. Remove `(storefront)` routes/components/cart/funnel stores and public browser Pixel mounting. Root `/` redirects to `/crm` or `/login` according to authentication. Preserve route auth and French copy. Keep legacy `/api/orders` temporarily if needed for compile; task 11 removes it after v1 exists. Retain CRM design/theme and operational behavior.
5. Keep relevant regression scripts and their loader/helpers so later tasks can adapt them. Record every suite/script needing adaptation; no standalone testing task. Remove storefront-only dependencies only after checking actual imports. Preserve SQLite lazy init and standalone build config.
6. Set package name `cod-crm-starter`; generate lockfile through npm. Provisional DB/upload defaults must target target-local `data/crm.db`, not Zehri data. `npm install`, `npm run lint`, `npx tsc --noEmit`, `npm run build` in target. Use isolated mock env if runtime needed; never source `.env.local`.
7. New target `AGENTS.md` must preserve stock ownership, atomic confirmation, durable jobs, BL reconciliation, Ozon URL redaction, French/MAD and mock-only verification. Avoid adding broad source production/catalog instructions. Copy this spec into target `specs/cod-crm-starter/` as implementation context; orchestrator tracks status consistently.

## Acceptance Criteria

- [ ] Target contains independent Git initialization and no source remote/history/private runtime artifacts.
- [ ] CRM/login pages compile/build; root does not expose a storefront.
- [ ] Fresh mock startup initializes an empty database with no seeded user/product/order.
- [ ] Source `git status` changes only by this specification's existing documents, never extraction edits.
- [ ] Manifest and provisional agent instructions allow all later agents to work only in target.

## Notes

This is the intentional broad file-count bootstrap exception. No commits/push are necessary here; release task handles publication. Actual public repository creation is explicitly approved but must wait for release verification.
