# Task 29: Automatic order assignment to agents

## Status

pending

## Wave

5

## Description

Assignment is manual only (`assignOrder` in `src/lib/services/orders.ts:783-797`; agents can only assign to themselves via `src/app/api/crm/orders/[id]/assign/route.ts`). Teams with several confirmation agents need new orders distributed automatically. Add a store setting `assignmentMode`: `manual` (default, current behavior), `round_robin`, or `least_loaded`, applied when a storefront or manual order is created.

## Dependencies

**Depends on:** task-14-manual-orders-packs-tombstone.md, task-21-customer-blocklist-history.md, task-26-utm-attribution.md
**Blocks:** None

**Context from dependencies:** Task 14 changed pricing in `src/lib/services/manual-orders.ts` (packs applied like checkout, tombstones for deleted requests). Task 21 edited `listOrders`/`getCustomerHistory` in `src/lib/services/orders.ts`. Task 26 extended `insertStorefrontOrder` in `src/lib/services/storefront-orders.ts` with attribution columns and edited `orders.ts` (`getCrmOrder` attribution, list filters). This task now owns those three service files.

## Files to Create

- `src/lib/services/assignment.ts` — `pickAssignee(db, mode): string | null`.
- `scripts/unit/assignment.test.mjs`

## Files to Modify

- `src/lib/store-settings-schema.ts` — `assignmentMode: z.enum(["manual","round_robin","least_loaded"]).default("manual")`.
- `src/lib/services/store-settings.ts` — persist the new setting with the existing JSON object (update the "six safe settings" comment).
- `src/components/crm/store-settings-form.tsx` — select `Attribution des commandes` with options `Manuelle`, `Tour de rôle`, `Charge la plus faible`.
- `src/lib/services/storefront-orders.ts` — after inserting the order, inside the same transaction, `assigned_to = pickAssignee(db, mode)` when mode ≠ manual.
- `src/lib/services/manual-orders.ts` — same, unless the creating agent already assigns to self (keep explicit assignment).
- `src/lib/services/orders.ts` — export a helper for eligible agents if `isAgentEligible`/`listAgents` aren't enough.

## Technical Details

- Eligible: active users with role `agent` (reuse `isAgentEligible` logic). If none, leave unassigned.
- `round_robin`: cursor in `app_state` key `assignment_cursor` (last assigned user id); next eligible by stable order (`created_at, id`). Update cursor in the same transaction.
- `least_loaded`: agent with fewest orders where `confirmation_status IN ('new','no_answer','call_back_later')` and not archived; tie → round-robin cursor.
- Must be deterministic inside the checkout `.immediate()` transaction; no async work.
- Receipt replays must not reassign (they return the stored receipt before insertion).
- Settings route already calls `revalidateStorefront()`; assignment doesn't affect storefront but keep the call.

## Acceptance Criteria

- [ ] With `round_robin` and 3 agents, 6 orders are assigned A,B,C,A,B,C.
- [ ] `least_loaded` picks the agent with fewest open orders.
- [ ] Deactivated agents are skipped; `manual` changes nothing.
- [ ] `npm run test:crm` and unit tests pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
