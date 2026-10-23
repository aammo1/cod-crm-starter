# Task 20: Close returns that arrive empty or are lost

## Status

complete

## Wave

2

## Description

`receiveReturnLines` returns early when no units are entered (`src/lib/services/inventory.ts:778-780`) and the inspect route rejects a zero total (`src/app/api/crm/returns/[id]/inspect/route.ts:146-151`). A parcel lost by the courier or returned empty therefore stays `received` forever, polluting the returns queue.

## Dependencies

**Depends on:** task-06-request-body-limits-and-upload-reencode.md
**Blocks:** None

**Context from dependencies:** Task 06 switched the inspect route to `readLimitedJson(request, 32 * 1024)`; keep that.

## Files to Modify

- `src/lib/services/inventory.ts` — support a zero-unit inspection outcome (it is the sole writer of stock/ledger; a zero outcome writes no stock movement).
- `src/lib/services/returns.ts` — mark the return `inspected` with the outcome and reason.
- `src/app/api/crm/returns/[id]/inspect/route.ts` — accept `{ outcome: "closed_empty" | "lost", reason }` with zero lines.
- `src/components/crm/return-inspect.tsx` — `Clôturer sans article` action with outcome select (`Colis vide`, `Perdu par le transporteur`) and mandatory reason (≤ 500 chars).
- `scripts/returns-workflow.test.mjs` — tests.

## Technical Details

- `returns` table (`migrations/001_init.sql:~95`) has `status` (`returning|received|inspected`), `sellable_qty`, `damaged_qty`, `reason`. Use `status='inspected'`, quantities 0, and store the outcome in `reason` as `"[closed_empty] <reason>"` / `"[lost] <reason>"` — no migration needed. If return line tables (`migrations/006_return_lines.sql`) require per-line rows, write none.
- Admin-only for `lost` (it implies a courier claim); agents may use `closed_empty`. Check the existing inspect route's role requirement and keep it at least that strict.
- Quarantine/reserved stock must be untouched; any quarantine entries tied to the return (if created at receive) must be released through the inventory service with a ledger entry — read `receiveReturnLines`/inspect flow to confirm whether receive creates quarantine; if it does not, nothing to release.
- Call `revalidateStorefront()` only if availability changed (it won't for zero units).

## Acceptance Criteria

- [ ] A received return can be closed with zero units and leaves the queue.
- [ ] No stock or ledger change occurs for zero-unit closure.
- [ ] `npm run test:crm` passes with new cases.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
