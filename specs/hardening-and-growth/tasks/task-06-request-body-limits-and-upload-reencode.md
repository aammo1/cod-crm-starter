# Task 06: Body size limits on every JSON route and re-encoded admin uploads

## Status

complete

## Wave

1

## Description

Many authenticated routes call plain `await request.json()` without a size limit, so any agent session (or anyone holding the catalog-agent key) can post a huge body and exhaust memory. A helper already exists: `readLimitedJson` in `src/lib/request-body.ts`. Separately, `src/app/api/admin/upload/route.ts:61-73` stores admin images after only a magic-bytes check, publishing EXIF metadata (GPS from phone photos) on the storefront; the catalog-agent upload already re-encodes with sharp (`src/app/api/catalog-agent/upload/route.ts:26-30`).

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-17-session-revocation.md, task-20-return-close-without-units.md, task-22-variant-cost-price.md

**Context from dependencies:** None.

## Files to Modify

Replace `request.json()` with `readLimitedJson(request, LIMIT)` (read its signature/return/error handling first and reuse its existing error responses) in:

- `src/app/api/admin/products/route.ts`, `src/app/api/admin/products/[id]/route.ts`, `src/app/api/admin/products/[id]/packs/route.ts` — 256 KiB
- `src/app/api/crm/bl/route.ts`, `src/app/api/crm/bl/operations/[id]/reconcile/route.ts` — 64 KiB
- `src/app/api/crm/orders/route.ts`, `src/app/api/crm/orders/lifecycle/route.ts` — 64 KiB
- `src/app/api/crm/orders/[id]/{assign,confirm,contacts,edit,lines,cancel}/route.ts` — 32 KiB
- `src/app/api/crm/parcels/[id]/handoff/route.ts`, `src/app/api/crm/returns/[id]/inspect/route.ts`, `src/app/api/crm/submissions/[id]/resolve/route.ts` — 32 KiB
- `src/app/api/crm/stock/{adjust,batch,opening}/route.ts` — 128 KiB
- `src/app/api/crm/team/route.ts`, `src/app/api/crm/team/[id]/route.ts`, `src/app/api/crm/team/[id]/password/route.ts` — 16 KiB
- `src/app/api/catalog-agent/route.ts` — 512 KiB
- `src/app/api/admin/upload/route.ts` — re-encode.

Before editing, run `grep -rn "request.json()" src/app/api` to catch any route not in this list and apply the same treatment. Leave `src/app/api/store/**` and `src/app/api/storefront/v1/**` alone unless they also use raw `request.json()` (they should already be limited — verify).

## Technical Details

### Body limits

- Keep each route's existing auth guard order (auth first, then body), status codes and French error messages for invalid JSON. Oversized bodies → 413 with the helper's message.
- Define limits as module-level constants (`const MAX_BODY_BYTES = 32 * 1024`).

### Upload re-encode

- After the existing content-type allowlist and magic-bytes check, decode with `sharp(buffer, { failOn: "error", limitInputPixels: 40_000_000 })`, `.rotate()` (apply EXIF orientation), then re-encode to the same format family (`jpeg({ quality: 85, mozjpeg: true })`, `png()`, `webp({ quality: 85 })`; AVIF if currently allowed). sharp strips metadata by default — do **not** call `withMetadata()`.
- Reject undecodable files with 400 `Image illisible.`.
- Mirror the catalog-agent upload implementation where possible (read it).
- Keep server-generated filenames and storage path logic unchanged.

## Acceptance Criteria

- [ ] `grep -rn "request.json()" src/app/api` returns no unbounded uses (or only documented safe ones).
- [ ] Oversized bodies return 413 without parsing.
- [ ] Uploaded JPEG with EXIF GPS is stored without EXIF (verify with `sharp(file).metadata()` → no `exif`).
- [ ] `npm run test:security`, `npm run test:crm`, `npm run test:catalog-agent` pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
