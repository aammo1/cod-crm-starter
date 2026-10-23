# Task 31: Business KPIs on the CRM dashboard

## Status

complete

## Wave

5

## Description

The dashboard (`src/lib/services/dashboard.ts` `getDashboard`, rendered by `src/app/(admin)/crm/page.tsx`) shows operational queues only. Add a date-range KPI section: orders, confirmation rate, delivery rate, refusal rate, revenue (delivered), cash collected, COGS, courier cost, ad spend, net profit, cost per confirmed/delivered order, ROAS, and breakdowns by UTM source/campaign and by product. Agents see operational rates; money figures are admin-only.

## Dependencies

**Depends on:** task-12-delivery-outcomes.md, task-22-variant-cost-price.md, task-23-ad-spend.md, task-26-utm-attribution.md, task-27-cod-remittance.md, task-28-city-tariffs.md
**Blocks:** None

**Context from dependencies:**
- Task 12: `orders.delivery_outcome` (`delivered|refused|NULL`), `delivery_outcome_at`.
- Task 22: `cost_price` (integer MAD, nullable) on the variants table.
- Task 23: `ad_spend(day, channel, campaign, amount)`, service `adSpendTotals({ from, to, groupBy })` in `src/lib/services/ad-spend.ts`.
- Task 26: `orders.utm_source/utm_medium/utm_campaign/utm_content/utm_term/referrer_host/landing_path`.
- Task 27: `orders.cod_status` (`awaiting_payment|paid`), `cod_paid_at`, tables `cod_remittances`, `cod_remittance_lines(paid_amount, fee_amount)`.
- Task 28: `city_tariffs(city_id, courier_cost)`, `app_state.default_courier_cost`, service `getCityTariff`, `defaultCourierCost()` in `src/lib/services/city-tariffs.ts`.

## Files to Create

- `src/lib/services/kpis.ts` — `getKpis({ from, to, role })`.
- `src/components/crm/kpi-section.tsx` — range picker (Aujourd'hui, 7 j, 30 j, Ce mois, personnalisé) via search params; stat tiles + tables.
- `scripts/unit/kpis.test.mjs`

## Files to Modify

- `src/app/(admin)/crm/page.tsx` — render `KpiSection` above or below existing queues.
- `src/lib/services/dashboard.ts` — only if shared date helpers must be exported; do not change existing queue numbers (`scripts/dashboard-accuracy.test.mjs` must keep passing).

## Technical Details

### Definitions (range on `orders.created_at`, converted with Africa/Casablanca day boundaries — reuse `casablancaLocalToUtcIso` / `endOfTodayCasablancaIso` in `src/lib/services/orders.ts`)

- `orders`: non-archived, non-test orders created in range (check how test/archived orders are excluded elsewhere, e.g. dashboard queries).
- `confirmationRate = confirmed / (orders − still-new)`; also show raw counts.
- `deliveryRate = delivered / (delivered + refused)` among confirmed orders with an outcome; show `pending outcome` count.
- `revenueDelivered = Σ orders.total where delivered`.
- `cashCollected = Σ paid_amount` of remittance lines for those orders; `courierFees = Σ fee_amount`.
- `cogs = Σ line qty × current variant cost_price` for delivered orders (items in `items_json` + upsell items; mark "coût actuel"; count lines without cost as `missing cost` and show a warning).
- `courierCost = Σ per shipped order (city_tariffs.courier_cost ?? default_courier_cost ?? 0)`; refused parcels also cost (count them); show `missing tariff` count.
- `adSpend = Σ ad_spend.amount where day in range`.
- `netProfit = revenueDelivered − cogs − courierCost − courierFees(if not already in courierCost; document choice: use tariff cost when present, remittance fees otherwise — never both for the same order) − adSpend`.
- `cpaConfirmed = adSpend / confirmed`, `cpaDelivered = adSpend / delivered`, `roas = revenueDelivered / adSpend` (null when divisor 0).
- Breakdowns: by `utm_source` and `utm_campaign` (orders, confirmed, delivered, revenue; ad spend joined by campaign when `ad_spend.campaign` equals `utm_campaign`), and top 10 products by delivered units.
- Integer MAD everywhere; rates as percentages with one decimal.

### Permissions

- Agents: counts and rates only. Admins: everything. Enforce in the service (`role` argument) and the page (server-side `auth`), not only in the UI.

### Performance

SQLite aggregates; avoid N+1. Fine at small scale; parse `items_json` with `json_each` where possible.

## Acceptance Criteria

- [ ] A fixture with known orders/outcomes/costs/spend yields exact expected KPIs (unit test).
- [ ] Agents never receive money fields.
- [ ] `npm run test:crm` (including `dashboard-accuracy`) passes.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
