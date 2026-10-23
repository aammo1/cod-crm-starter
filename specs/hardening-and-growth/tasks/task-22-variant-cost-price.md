# Task 22: Product cost price per variant

## Status

complete

## Wave

3

## Description

Profit and ROAS reporting (task 31) need the cost of goods. Add an optional integer MAD `cost_price` per variant, editable in the admin product form, snapshotted onto order lines at order creation is **not** required (historical lines keep sale snapshots only); the dashboard uses the current variant cost with a "coût actuel" disclaimer. Cost is admin-only data: it must never reach the storefront DTOs, the v1 storefront API or agent-visible pages.

## Dependencies

**Depends on:** task-06-request-body-limits-and-upload-reencode.md
**Blocks:** task-31-dashboard-kpis.md

**Context from dependencies:** Task 06 switched `src/app/api/admin/products/route.ts` and `src/app/api/admin/products/[id]/route.ts` to `readLimitedJson(request, 256 * 1024)`.

## Files to Create

- `migrations/022_variant_cost.sql`

## Files to Modify

- `src/lib/services/catalog-schemas.ts` — optional `costPrice` (integer ≥ 0, ≤ 1,000,000) on variant input.
- `src/lib/services/catalog.ts` — persist/read `cost_price` in admin paths only; ensure variant IDs/SKUs are preserved on edit (never recreate).
- `src/components/admin/variant-editor.tsx` — `Coût d'achat (MAD)` input per variant.
- `src/components/admin/product-form.tsx` — wire the field if the form owns variant state.
- `src/app/api/admin/products/route.ts`, `src/app/api/admin/products/[id]/route.ts` — only if they whitelist fields.

## Technical Details

### Migration 022

```sql
ALTER TABLE variants ADD COLUMN cost_price INTEGER CHECK (cost_price IS NULL OR cost_price >= 0);
```
Check the actual variants table name in `migrations/016_starter_commerce.sql` (it may be `product_variants`) and use it.

### Rules

- Grep for every DTO builder: `src/lib/storefront-catalog-dto.ts`, `src/lib/storefront/data.ts`, `src/app/api/storefront/v1/**`, `src/lib/services/catalog-agent.ts`, assistant tools (`src/lib/assistant-tools.ts`). Verify none expose `cost_price`; add a test asserting the storefront DTO for a product with cost has no cost key.
- Changing cost does **not** affect storefront prices, so no `revalidateStorefront()` call is needed for cost-only changes (but existing product save routes already call it — keep).
- Admin-only: product routes already require admin; keep.

## Acceptance Criteria

- [ ] Admin can set and edit cost per variant; value persists and round-trips.
- [ ] Storefront DTOs, v1 API, catalog-agent and assistant outputs never include cost.
- [ ] `npm run test:catalog-agent`, `npm run test:crm` pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
