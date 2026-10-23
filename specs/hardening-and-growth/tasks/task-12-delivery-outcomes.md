# Task 12: Agent-declared delivery outcomes (Livré / Refusé)

## Status

complete

## Wave

1

## Description

Tracking never classifies statuses: `STATUS_MAP` in `src/lib/shipping/status-map.ts` is intentionally empty until Ozon status strings are verified live, so `applySideEffects` in `src/lib/services/tracking.ts:275-308` never runs delivered-dispatch recovery or `ensureReturn`. Delivered and refused parcels are invisible unless an agent declares a return by hand. Add a durable per-order delivery outcome that agents/admins can set from the order page, which runs the **same** side effects as verified tracking would, and which tracking writes automatically once mappings exist. Later tasks (customer history, COD remittance, dashboard KPIs, CSV export) read this outcome.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-21-customer-blocklist-history.md, task-27-cod-remittance.md, task-31-dashboard-kpis.md, task-32-orders-csv-export.md

**Context from dependencies:** None.

## Files to Create

- `migrations/020_delivery_outcomes.sql`
- `src/lib/services/delivery-outcomes.ts` — `setDeliveryOutcome`, `getDeliveryOutcome`.
- `src/app/api/crm/orders/[id]/delivery-outcome/route.ts` — `POST`.
- `src/components/crm/delivery-outcome-actions.tsx` — client buttons with confirm dialog.
- `scripts/unit/delivery-outcomes.test.mjs`

## Files to Modify

- `src/lib/services/tracking.ts` — in `applySideEffects`, for `delivered` and `refused` also call `setDeliveryOutcome(..., source: "tracking")` (idempotent; never overrides an agent value).
- `src/app/(admin)/crm/orders/[id]/page.tsx` — render `DeliveryOutcomeActions` and the current outcome (badge `Livré` / `Refusé`, who/when/source) for orders with a submitted parcel.

## Technical Details

### Migration 020

```sql
ALTER TABLE orders ADD COLUMN delivery_outcome TEXT CHECK (delivery_outcome IS NULL OR delivery_outcome IN ('delivered','refused'));
ALTER TABLE orders ADD COLUMN delivery_outcome_at TEXT;
ALTER TABLE orders ADD COLUMN delivery_outcome_by TEXT;
ALTER TABLE orders ADD COLUMN delivery_outcome_source TEXT CHECK (delivery_outcome_source IS NULL OR delivery_outcome_source IN ('agent','tracking'));
CREATE INDEX idx_orders_delivery_outcome ON orders(delivery_outcome, delivery_outcome_at);
```

### Service rules (`setDeliveryOutcome(orderId, outcome, actor: { id, role } | "tracking-poller", source)`)

- Run in `getDb().transaction(...).immediate()`.
- Order must be confirmed and have a `courier_submissions` row with status `submitted` and a tracking number; else 409 `Aucun colis expédié pour cette commande.`
- **delivered**: ensure dispatch is recorded exactly once by reusing the existing guarded path (`recoverDispatch(orderId, actor)` from the inventory service as used by `recoverMissedDispatch` in `tracking.ts:255-273` — skip if a `dispatch`/`disp*` movement exists). Inventory remains the sole stock writer: call its exported function, never write stock tables. `cod_status` stays `awaiting_payment` (delivered ≠ paid; task 27 handles payment).
- **refused**: call `ensureReturn(submission.id, "refused (agent)")` from `src/lib/services/returns.ts` (insert-or-ignore; no stock change — stock changes only at return inspection).
- Changing delivered → refused or refused → delivered is admin-only and requires a non-empty `reason` (≤ 500 chars), recorded in the order's edit/history log if a history mechanism exists (check `src/lib/services/order-edits.ts` / `order-lifecycle.ts` history tables; otherwise add the reason to `order_contacts` via `insertContact` as a note — pick the existing audit mechanism, do not invent a new table). Switching delivered→refused after dispatch must not re-credit stock (returns inspection does that).
- Tracking source never overwrites an existing agent outcome; agent may overwrite tracking only with admin + reason.
- Same outcome twice → no-op 200.

### Route

`POST /api/crm/orders/:id/delivery-outcome` body `{ outcome: "delivered" | "refused", reason?: string }`; `requireUser` (agents and admins; transitions per rules above); body via `readLimitedJson` (32 KiB) from `src/lib/request-body.ts`; zod validation; French errors; returns `{ outcome, at, by, source }`. Mirror the structure of `src/app/api/crm/orders/[id]/cancel/route.ts`.

### UI

Two buttons `Marquer livré` / `Marquer refusé` with a confirm step (reuse dialog/button components from `src/components/ui`). Mobile-friendly. After success `router.refresh()`.

### Tests

delivered records dispatch once (call twice); refused creates one return; tracking source does not override agent; unsubmitted order → 409; agent cannot flip outcome; admin can with reason.

## Acceptance Criteria

- [ ] Migration applies on fresh DB and on a DB at 019.
- [ ] Agent can mark a shipped order delivered/refused from the order page; side effects match tracking semantics and are idempotent.
- [ ] `npm run test:crm` and new unit tests pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
