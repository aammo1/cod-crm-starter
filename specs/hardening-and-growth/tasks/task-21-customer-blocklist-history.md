# Task 21: Phone blocklist and richer customer history

## Status

complete

## Wave

3

## Description

Refusals are the main cost in Moroccan COD. `getCustomerHistory` in `src/lib/services/orders.ts:844-873` already shows other orders for the same phone (counts confirmed/cancelled/returned) on the order page, but there is no blocklist, no delivered/refused counts and nothing in the orders list. Add a phone blocklist managed by admins (agents can propose/add with reason), show a prominent warning on the order page and a badge in the orders list, and extend history with delivery outcomes. Orders from blocked phones are **still accepted** at checkout (no customer-facing change); they are flagged for agents.

## Dependencies

**Depends on:** task-12-delivery-outcomes.md
**Blocks:** task-26-utm-attribution.md, task-28-city-tariffs.md, task-29-auto-assignment.md, task-32-orders-csv-export.md

**Context from dependencies:** Task 12 added `orders.delivery_outcome` (`'delivered'|'refused'|NULL`), `delivery_outcome_at`, `delivery_outcome_by`, `delivery_outcome_source` (`'agent'|'tracking'`) via `migrations/020_delivery_outcomes.sql`, and a `DeliveryOutcomeActions` component on the order page.

## Files to Create

- `migrations/021_customer_blocklist.sql`
- `src/lib/services/customers.ts` — blocklist CRUD + `isPhoneBlocked`.
- `src/app/api/crm/blocklist/route.ts` — `GET` list (admin), `POST` add (agent or admin).
- `src/app/api/crm/blocklist/[phone]/route.ts` — `DELETE` (admin only).
- `src/components/crm/blocklist-manager.tsx` — admin list/remove UI.
- `src/components/crm/block-phone-button.tsx` — order-page action.
- `scripts/unit/customers.test.mjs`

## Files to Modify

- `src/lib/services/orders.ts` — `getCustomerHistory` adds `deliveredCount`, `refusedCount`, `blocked: { reason, createdAt, createdBy } | null`; `listOrders` rows include `phoneBlocked: boolean` and `priorRefusals: number` (subquery on normalized phone). Also make the JS normalization (`phone.replace(/[\s\-().]/g, "")` around line 845 and ~550) consistent with `normalizedPhoneExpr` SQL (both strip the same characters).
- `src/components/crm/orders-table.tsx` — badges `Bloqué` (red) and `N refus` (amber).
- `src/app/(admin)/crm/orders/[id]/page.tsx` — blocked banner at the top, delivered/refused counts in the history card, `BlockPhoneButton`.
- `src/app/(admin)/crm/parametres/page.tsx` — mount `BlocklistManager` section `Numéros bloqués` (admin page).

## Technical Details

### Migration 021

```sql
CREATE TABLE IF NOT EXISTS blocked_phones (
  phone TEXT PRIMARY KEY,            -- normalized E.164 (+212XXXXXXXXX)
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
```

### Rules

- Normalize with `normalizeMaPhone` from `src/lib/phone.ts` (returns `+212…` or null → 400 `Numéro invalide.`).
- Agents may add (reason required); only admins may list all and remove.
- Body limits via `readLimitedJson` (16 KiB); zod validation; `requireUser`/`requireAdmin` from `src/lib/auth-guards.ts`.
- `priorRefusals` counts other orders with the same phone where `delivery_outcome='refused'` or a return exists (reuse the existing `returned` subquery logic).
- Keep the orders list query efficient: compute blocked via `LEFT JOIN blocked_phones bp ON bp.phone = o.customer_phone`.
- Do not change checkout behavior.

## Acceptance Criteria

- [ ] Agent can block a phone from an order; admin can review/remove in Paramètres.
- [ ] Orders list and order page show blocked/refusal signals.
- [ ] History shows delivered and refused counts.
- [ ] Migration applies on a DB at 020; `npm run test:crm` and new unit tests pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
