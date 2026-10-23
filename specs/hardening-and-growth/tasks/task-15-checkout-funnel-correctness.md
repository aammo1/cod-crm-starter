# Task 15: Checkout funnel correctness (attempt keys, errors, totals)

## Status

complete

## Wave

2

## Description

Several storefront funnel defects cost orders or create duplicates:
1. `src/components/storefront/funnel/use-checkout.ts:91-93` mints a **new** idempotency key whenever the payload changes. After an uncertain result (timeout/5xx/network error), correcting the name or phone creates a second order — violating "never rotate keys to bypass an uncertain result".
2. Server phone errors appear as a generic error; 429 ignores `retryAfter`; uncertain outcomes show a generic error with no WhatsApp fallback (`checkout-modal.tsx:59`, `inline-order-form.tsx:121`).
3. Confirmation and thank-you line items use `unitPrice × qty` without the pack discount, so lines don't add up to the server total (`inline-order-form.tsx:127`, `checkout-modal.tsx:65,94`, `merci/thank-you.tsx:25`).
4. The sticky CTA shows the net price before shipping while the form shows the total with shipping (`inline-order-form.tsx:81`, `landing/sticky-cta.tsx`).

## Dependencies

**Depends on:** task-02-phone-normalization.md, task-08-storefront-polish.md
**Blocks:** task-24-accent-foreground-theme.md, task-25-customer-order-tracking-page.md, task-26-utm-attribution.md, task-30-abandoned-checkout-leads.md

**Context from dependencies:** Task 02 made `normalizeMaPhoneClient` (in `funnel/phone.ts`) identical to the server normalizer (06/07 mobiles, +212/00212/0 prefixes, Arabic-Indic digits) and made `POST /api/store/checkout` return `400 { code: "INVALID_PHONE" }` for phone failures. Task 08 finished its edits to `src/config/i18n.ts` (ownership passes to this task) and moved the WhatsApp button above the sticky CTA.

## Files to Modify

- `src/components/storefront/funnel/use-checkout.ts`
- `src/components/storefront/funnel/checkout-modal.tsx`
- `src/components/storefront/landing/inline-order-form.tsx`
- `src/components/storefront/landing/sticky-cta.tsx`
- `src/app/(storefront)/merci/thank-you.tsx`
- `src/config/i18n.ts` — new strings in `fr` and `ar`.

## Technical Details

### 1. Uncertain attempt lock

- Extend the stored key record (localStorage, key `${storeSlug}-checkout-key`) to `{ key, payload, eventId, uncertain: boolean, createdAt }`.
- After a result with `uncertain: true` (the hook already computes `uncertain`), persist `uncertain: true`.
- While `uncertain` is true: reuse **the same key and the same original payload** on retry — submit the stored payload, not the edited form. If the form values differ from the stored payload, show `checkoutUncertainLocked` ("Votre commande précédente est peut-être déjà enregistrée. Réessayez sans modifier, ou contactez-nous sur WhatsApp." / ar equivalent) with two actions: `Réessayer` (resubmit stored payload) and WhatsApp link (reuse the WhatsApp number/link builder from `layout/whatsapp-button.tsx` or `src/lib/wa-templates.ts` if client-safe).
- Clear the record only on a definitive result: success (2xx), or a definitive 4xx (validation `INVALID_REQUEST`/`INVALID_PHONE`, `409` conflicts that the server documents as final). A 409 receipt-mismatch for the same key must **not** rotate the key.
- Keep the in-flight promise + `busy` double-submit guards.

### 2. Error mapping

- `INVALID_PHONE` → field error `phoneInvalid` (existing key if present).
- `429` with `code: "PHONE_RECENTLY_ORDERED"` (added by task 16 in this same wave) → definitive (clear the attempt record) and show `phoneRecentlyOrdered`: "Une commande récente existe déjà pour ce numéro. Un conseiller vous appellera." / "يوجد طلب حديث بهذا الرقم. سيتصل بك أحد مستشارينا." plus the WhatsApp link.
- 429 → read `Retry-After` header or `retryAfter` body field; show `retryLaterSeconds` with the number of seconds and disable submit until elapsed.
- Uncertain → message above plus WhatsApp fallback.

### 3. Line totals

Use the server response: if the checkout response `totals` includes `discount`, render each line at regular price and a separate line `Remise pack` / `خصم العرض` with `-discount`, then shipping, then total. Do the same in `thank-you.tsx` (read where it gets its data — session/localStorage — and include `discount`). Lines + discount + shipping must equal total.

### 4. Sticky CTA price

Pass the same `total` (with shipping) the form shows, or label the price with `fromPrice` ("à partir de" / "ابتداءً من") if total isn't computable. Prefer the total.

### Bundle

No zod/libphonenumber in client code; keep overlays loaded via `next/dynamic`. Run `npm run perf-budget` after build.

## Acceptance Criteria

- [ ] Simulated timeout then editing phone → retry reuses the original key and payload; no second order is created (verify against a mock-provider dev server or by unit-testing the key logic extracted into a pure function in `use-checkout.ts`).
- [ ] Invalid phone from the server shows the phone field error.
- [ ] 429 shows seconds to wait.
- [ ] Displayed lines + pack discount + shipping = total on modal, inline form and thank-you page.
- [ ] Sticky CTA price equals the form total.
- [ ] fr/ar parity compiles; `npm run perf-budget` passes.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
