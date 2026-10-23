# Task 25: Customer order tracking page

## Status

complete

## Wave

3

## Description

Customers call or WhatsApp to ask "where is my order?". Add a public page `/suivi` where a shopper enters their order number and phone to see a simple status (received → confirmed → shipped → delivered/refused/cancelled) and the tracking number once shipped. The thank-you page links to it.

## Dependencies

**Depends on:** task-12-delivery-outcomes.md, task-15-checkout-funnel-correctness.md
**Blocks:** task-30-abandoned-checkout-leads.md (next owner of `src/config/i18n.ts`)

**Context from dependencies:** Task 12 added `orders.delivery_outcome` (`delivered`/`refused`/NULL). Task 15 owns and finished edits to `src/config/i18n.ts` and `src/app/(storefront)/merci/thank-you.tsx`; this task now owns both.

## Files to Create

- `src/app/(storefront)/suivi/page.tsx` — static page shell (no `cookies()/headers()`, no DB imports) rendering a client form.
- `src/components/storefront/tracking-lookup/tracking-form.tsx` — client component posting to the API.
- `src/app/api/store/track/route.ts` — `POST { orderRef, phone }`.
- `src/lib/services/order-tracking-lookup.ts` — server lookup returning a minimal public status.

## Files to Modify

- `src/config/i18n.ts` — strings in fr + ar (title, labels, statuses, not-found message, rate-limited message).
- `src/app/(storefront)/merci/thank-you.tsx` — link `Suivre ma commande` → `/suivi?ref=<orderRef>`.
- `src/components/storefront/layout/footer.tsx` — link to `/suivi`.
- `src/app/robots.ts` — keep `/suivi` crawlable or disallow (choose disallow: it has no SEO value); `src/app/sitemap.ts` must not list it (check — task 09 edited sitemap; only touch it if `/suivi` would otherwise be included).

## Technical Details

- **Order reference**: use the same order reference shown on the thank-you page (check what's displayed — full UUID or a short prefix). Accept the full order id, or the displayed short reference if one exists; matching must also require the normalized phone (`normalizeMaPhone` from `src/lib/phone.ts`, server side) to equal `orders.customer_phone`. Mismatch and not-found return the same generic 404 response (no enumeration).
- **Response** (no PII beyond what the requester typed): `{ status: "received"|"confirmed"|"shipped"|"delivered"|"refused"|"cancelled", trackingNumber?: string, updatedAt }`. Derive: cancelled if `confirmation_status='cancelled'`; delivered/refused from `orders.delivery_outcome` (added by task 12); shipped if a `courier_submissions` row is `submitted`; confirmed if `confirmation_status='confirmed'`; else received. Never return address, items, totals or agent info.
- **Protection**: reuse `guardStoreRequest(request, ...)` from `src/lib/storefront/browser-guard.ts` for origin checks and add a budget scope (e.g. `store-track`, 10/min per IP, 300/min global) using the existing budget helpers; body via the same limited JSON reading the guard does. `Cache-Control: no-store`.
- The page itself is static; the result is fetched client-side. The page reads nothing from the DB and does not use `src/lib/storefront/data.ts`.
- RTL: the phone input `dir="ltr"` as elsewhere.
- Keep the page JS small (no zod on the client; use `normalizeMaPhoneClient` from `funnel/phone.ts` for pre-validation). Add the route to `scripts/perf-budget.mjs` only if it enumerates pages to check (optional).

## Acceptance Criteria

- [ ] Correct ref + phone shows status; wrong phone and unknown ref return the identical generic message.
- [ ] Budget limits the endpoint; origin check enforced.
- [ ] fr/ar strings complete; RTL correct.
- [ ] `DELIVERY_PROVIDER=mock npm run build` and `npm run perf-budget` pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
