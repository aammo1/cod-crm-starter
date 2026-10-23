# Task 28: Per-city courier cost and optional customer fee override

## Status

complete

## Wave

4

## Description

Shipping is a flat fee plus a free-shipping threshold (`src/lib/pricing.ts:13-21`). The operator's real cost per parcel varies by city and is not tracked, so profit is unknown; some stores also charge more for remote cities. Add a city tariff table: `courier_cost` (what the courier charges you, for profit reporting) and an optional `customer_fee_override`. Checkout is unchanged (the shopper has no city at checkout — agents collect it). When an agent sets/changes the city in an order edit, the override (if any) is proposed and applied explicitly, and the UI shows the new total before saving.

## Dependencies

**Depends on:** task-13-order-edit-repricing.md, task-21-customer-blocklist-history.md
**Blocks:** task-31-dashboard-kpis.md

**Context from dependencies:** Task 13 rewrote pricing in `src/lib/services/order-edits.ts`: untouched lines keep original unit prices, `discountMode: "pack" | "manual"` recomputes pack discounts server-side, shipping comes from `orderShippingRules(orderId)` applied to `subtotal - discount`. Task 21 added a `Numéros bloqués` section to `src/app/(admin)/crm/parametres/page.tsx`; this task now owns that page.

## Files to Create

- `migrations/026_city_tariffs.sql`
- `src/lib/services/city-tariffs.ts` — `listCityTariffs`, `upsertCityTariff`, `getCityTariff(cityId)`, `defaultCourierCost()`.
- `src/app/api/crm/city-tariffs/route.ts` — `GET`, `POST` (admin); bulk CSV paste supported via the same route (`{ rows: [...] }`).
- `src/components/crm/city-tariffs-manager.tsx` — searchable list using the cities list (`listCities()` in `src/lib/services/orders.ts`).
- `scripts/unit/city-tariffs.test.mjs`

## Files to Modify

- `src/app/(admin)/crm/parametres/page.tsx` — mount `CityTariffsManager` section `Tarifs par ville`.
- `src/lib/services/order-edits.ts` — accept `applyCityFee: boolean` in the edit input; when true and the order's city has `customer_fee_override`, use it as the shipping fee (free-shipping threshold still applies unless `override_ignores_free_threshold`); persist the fee used in the order's shipping rules snapshot (`app_state` key from `orderRulesKey(orderId)` — read how it's stored) so later edits are consistent.
- `src/lib/order-edit-schema.ts` — `applyCityFee` optional boolean.
- `src/components/crm/edit-order.tsx` — when city has an override, show `Frais de livraison pour <ville> : X MAD (au lieu de Y)` with a checkbox `Appliquer`; recompute preview.

## Technical Details

### Migration 026

```sql
CREATE TABLE IF NOT EXISTS city_tariffs (
  city_id INTEGER PRIMARY KEY,
  courier_cost INTEGER CHECK (courier_cost IS NULL OR courier_cost >= 0),
  customer_fee_override INTEGER CHECK (customer_fee_override IS NULL OR customer_fee_override >= 0),
  override_ignores_free_threshold INTEGER NOT NULL DEFAULT 0 CHECK (override_ignores_free_threshold IN (0,1)),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);
```

Store a default courier cost (for cities without a row) in `app_state` key `default_courier_cost` (integer MAD, nullable).

### Rules

- Never apply a fee change silently: only when `applyCityFee` is true in the agent's edit.
- Confirmation (`src/lib/services/confirmation.ts`) is not changed.
- Courier cost is admin data; never exposed to storefront or agents' order pages (dashboard only).
- Admin only routes; `readLimitedJson` 128 KiB; zod.

## Acceptance Criteria

- [ ] Admin can set courier cost and fee override per city, plus a default cost.
- [ ] Editing an order's city with override + `applyCityFee` changes shipping and total; without it nothing changes.
- [ ] `npm run test:crm` passes, including an order-edit case for the override.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
