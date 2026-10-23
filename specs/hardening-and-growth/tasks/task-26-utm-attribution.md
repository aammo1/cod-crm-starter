# Task 26: First-touch UTM and referrer attribution on orders

## Status

complete

## Wave

4

## Description

Only `fbclid`/`ttclid` are captured (`src/lib/storefront/track.ts:44-54`) and checkout forwards only `eventId, sourceUrl, fbp, fbc, ttp, ttclid` (`ATTRIBUTION_KEYS` in `src/app/api/store/checkout/route.ts`). The operator cannot tell which campaign, ad set or creative produced an order. Capture first-touch `utm_source/medium/campaign/content/term`, the external referrer host and landing path in the browser, send them with checkout, persist them on the order, and show them in the CRM. Task 31 aggregates them; task 32 exports them.

## Dependencies

**Depends on:** task-15-checkout-funnel-correctness.md, task-16-rate-limit-availability.md, task-21-customer-blocklist-history.md
**Blocks:** task-29-auto-assignment.md, task-31-dashboard-kpis.md, task-32-orders-csv-export.md, task-33-consent-and-snap-pixel.md

**Context from dependencies:** Task 15 finished `use-checkout.ts` (attempt record `{ key, payload, eventId, uncertain, createdAt }` in localStorage; `attribution: { eventId, sourceUrl, ...readAttribution() }` is sent with checkout). Task 16 finished the checkout route (per-phone 429 `PHONE_RECENTLY_ORDERED`). Task 21 finished edits to `src/lib/services/orders.ts` and the order detail page (blocked banner, history counts). This task now owns those files.

## Files to Create

- `migrations/024_order_attribution.sql`
- `src/components/crm/order-attribution-card.tsx`

## Files to Modify

- `src/lib/storefront/track.ts` — capture and store first-touch attribution.
- `src/components/storefront/funnel/use-checkout.ts` — include it in `attribution` (stored inside the attempt payload so retries send identical data).
- `src/lib/storefront-api-schemas.ts` — extend `storefrontAttributionSchema` with optional bounded strings.
- `src/app/api/store/checkout/route.ts` — add keys to `ATTRIBUTION_KEYS`.
- `src/lib/services/storefront-orders.ts` — persist attribution in the same transaction as the order (pass through `insertStorefrontOrder`; find its definition and extend it).
- `src/lib/services/orders.ts` — `getCrmOrder` returns `attribution`; `listOrders` accepts optional filters `utmSource`, `utmCampaign`.
- `src/app/(admin)/crm/orders/[id]/page.tsx` — render `OrderAttributionCard`.

## Technical Details

### Migration 024

```sql
ALTER TABLE orders ADD COLUMN utm_source TEXT;
ALTER TABLE orders ADD COLUMN utm_medium TEXT;
ALTER TABLE orders ADD COLUMN utm_campaign TEXT;
ALTER TABLE orders ADD COLUMN utm_content TEXT;
ALTER TABLE orders ADD COLUMN utm_term TEXT;
ALTER TABLE orders ADD COLUMN referrer_host TEXT;
ALTER TABLE orders ADD COLUMN landing_path TEXT;
ALTER TABLE orders ADD COLUMN click_id_type TEXT CHECK (click_id_type IS NULL OR click_id_type IN ('fbclid','ttclid','gclid','sccid'));
CREATE INDEX IF NOT EXISTS idx_orders_utm ON orders(utm_source, utm_campaign, created_at);
```

### Browser capture (track.ts)

- On first page view in a browser session window: if no stored first-touch exists **or** the current URL has any `utm_*`/click id (new campaign click), store `{ utm_*, referrerHost, landingPath, clickIdType, at }` in localStorage key `${storeSlug}-attribution` with 30-day expiry. Referrer host only if `document.referrer` is external (different host). Landing path = `location.pathname` (no query).
- Each value: trim, max 200 chars, strip control chars.
- Also recognise `gclid` and `ScCid` (Snap) as click id types (store only the type, not the value, unless an existing pixel flow needs the value).
- Keep track.ts tiny (perf budget); no zod.

### Server

- Zod: each field `z.string().trim().max(200).optional()`; `landingPath` must start with `/`; `referrerHost` hostname pattern.
- Persist only on new orders (receipt replays return the original receipt and must not write). Upsell does not change attribution.
- Manual orders: `source='manual'`; attribution NULL.
- v1 external storefront API: out of scope (do not change `src/app/api/storefront/v1/**`).

### CRM

Card `Origine de la commande`: source / medium / campagne / contenu / terme / référent / page d'arrivée; hide when all null. Orders list filters optional query params `utm_source`, `utm_campaign`.

## Acceptance Criteria

- [ ] Visiting `/l/x?utm_source=facebook&utm_campaign=ete` then ordering stores both on the order and shows them in the CRM.
- [ ] Retries of an uncertain attempt send identical attribution.
- [ ] Malformed/oversized attribution never fails checkout (dropped instead) — matches current `buildMeta` safeParse behavior.
- [ ] `npm run test:crm`, `npm run perf-budget` pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
