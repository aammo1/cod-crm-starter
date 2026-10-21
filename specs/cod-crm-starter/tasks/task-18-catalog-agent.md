# Task 18: Adapt optional catalog automation to the generic catalog

## Status
pending

## Wave
7

## Description

Preserve Zehri's optional signed-preview/durable-receipt catalog automation in the public starter, using generic variants. Work only in `/home/tal7a/Projects/cod-crm-starter`; this must not change the globally installed Zehri skill/client or its live store configuration.

## Dependencies

**Depends on:** task-08-catalog-management.md, task-14-fulfillment.md
**Blocks:** task-20-release-integration.md

**Context from dependencies:** Catalog CRUD/admin now support product galleries, arbitrary options and stable variant IDs/SKUs; initial stock creation goes through inventory. Completed generic fulfillment preserves variant references through dispatch and return; automation must preserve those identities when editing/archiving/restoring products already used by those workflows. Source catalog-agent supports create/edit/archive/restore with signed previews/revision checks and durable request receipts, uses `CATALOG_AGENT_KEY` separate from storefront key, and previously keyed opening stock by color/size.

## Files to Create

- `docs/catalog-agent.md` — starter-local automation setup/contract reference.

## Files to Modify

- `src/lib/services/catalog-agent.ts`, `src/lib/catalog-agent-auth.ts`
- `src/app/api/catalog-agent/` route subtree only if serialization changes.
- `scripts/catalog-agent-client.mjs`, `scripts/catalog-agent.test.mjs`

## Technical Details

1. Replace `colors`/numeric size schema and initial-stock `colorKey,size` references with generic variant identity. During product creation use stable client variant keys mapped to server-created variant IDs; reject unknown/duplicate opening-stock entries, enforce limits and inventory ownership. Existing-stock receipts/corrections remain unavailable in this API.
2. Preserve revision-guarded signed previews, image validation, durable apply receipts, concurrent retry safety and archive/restore. Editing variants must not replace stable IDs or delete referenced histories. Use the same catalog schemas as admin, not a parallel incompatible product model.
3. Catalog-agent credential remains runtime-only minimum32 characters, unset disables surface; storefront API key grants no agent permissions. Media upload continues locally validated WebP/storage flow; no server request to untrusted remote URLs.
4. Neutralize client brand/env names in this new starter (document chosen `CRM_CATALOG_URL`, `CRM_CATALOG_KEY`), preserve command behavior and dry-run/apply ergonomics. Do not synchronize to `~/.agents/skills/zehri-catalog`, do not call live Zehri, do not copy its credentials/settings into public docs. Include local setup and generic creation/edit examples.
5. Adapt existing isolated regression scenarios for default/non-size variants, preview staleness, initial stock restrictions, images and concurrent retries. Verify automation edit/archive/restore after mock dispatch/return leaves historical variant IDs and inventory attribution intact, consuming the completed fulfillment APIs rather than editing their fixtures. Run `npm run test:catalog-agent`, `npm run lint`, `npx tsc --noEmit`.

## Acceptance Criteria

- [ ] Optional agent API/client manage generic variants with preserved previews/receipts/revision checks.
- [ ] Opening stock creation-only and exclusive inventory write rules remain enforced.
- [ ] Starter docs/client are independent of global/live Zehri configuration.
- [ ] Existing catalog-agent suite passes with isolated data.
