# Task 08: Storefront localization, accessibility and layout polish

## Status

complete

## Wave

1

## Description

Several small storefront defects hurt Arabic stores and mobile conversion: the storefront error page is hardcoded French and uses CRM tokens; the shared not-found content uses CRM tokens; the WhatsApp floating button covers the sticky order CTA on landing pages; cart quantity buttons have `aria-label="−"/"+"`; the mobile menu lacks Escape-to-close and a nav label; the Playfair heading font is never preloaded even when it is the heading font.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-15-checkout-funnel-correctness.md (ownership of `src/config/i18n.ts` passes to it)

**Context from dependencies:** None.

## Files to Modify

- `src/app/(storefront)/error.tsx` — localized copy and `store-*` theme classes.
- `src/components/shared/not-found-content.tsx` — use `store-*` classes when rendered in the storefront (it is also used globally; accept a `variant`/className prop or split storefront styling, keep global 404 working).
- `src/components/storefront/layout/whatsapp-button.tsx` — avoid overlapping the sticky CTA.
- `src/components/storefront/funnel/cart-drawer.tsx` — localized aria-labels (lines ~90, ~95).
- `src/components/storefront/layout/mobile-menu.tsx` — Escape closes, `aria-label` on `<nav>`.
- `src/app/fonts.ts` — preload the configured heading font.
- `src/config/i18n.ts` — add any new strings in **both** `fr` and `ar` (the dictionary is type-checked: ar must match fr keys).

## Technical Details

1. **error.tsx** is a client component (`"use client"`, receives `error, reset`). Get the locale from `store.config.ts` (import the validated config the same way other client storefront components do — check how `t(locale)` is used e.g. in `not-found-content.tsx` or funnel components) and use dictionary keys, e.g. `errorTitle`, `errorBody`, `errorRetry`, `errorHome`. Arabic examples: `حدث خطأ ما`, `تعذر تحميل الصفحة. حاول مرة أخرى.`, `إعادة المحاولة`, `العودة إلى الصفحة الرئيسية`. Replace `bg-primary`, `text-foreground` etc. with the storefront tokens used elsewhere (e.g. `bg-store-primary text-store-primary-fg`, `text-store-fg`; inspect `src/app/(storefront)/layout.tsx` and existing components for exact class names). Root `dir` is already set by the layout.
2. **WhatsApp button**: it is `fixed bottom-4 end-4 z-30`; the sticky CTA (`src/components/storefront/landing/sticky-cta.tsx`) is `fixed bottom-0 z-30` on `/l/*` and possibly product pages on mobile. Use `usePathname()` and, on routes where the sticky CTA renders (check where `StickyCta` is mounted), apply `bottom-24 md:bottom-4`. Do not edit `sticky-cta.tsx` (owned by task 15/24).
3. **cart-drawer**: use existing dictionary keys for decrease/increase quantity if present (grep `i18n.ts` for `decrease|increase|quantity`), otherwise add `qtyDecrease` / `qtyIncrease` (`Diminuer la quantité` / `Augmenter la quantité`; `إنقاص الكمية` / `زيادة الكمية`).
4. **mobile-menu** uses `<details>`: add a `keydown` listener for Escape that removes the `open` attribute and returns focus to the `<summary>`; close on link click; `aria-label` from dictionary (`Menu principal` / `القائمة الرئيسية`).
5. **fonts.ts**: Playfair has `preload: false`. Set `preload` true only when it is the configured heading font (read how the heading font is chosen from `store.config.ts`; if selection happens elsewhere, export both font objects with preload driven by config). Next/font requires static options — if config-driven preload is impossible, set `preload: true` for whichever font is the default heading font and document.

## Acceptance Criteria

- [ ] With `locale: "ar"` the storefront error page shows Arabic copy in storefront styling.
- [ ] On a mobile viewport on `/l/<slug>`, the WhatsApp button does not cover the sticky CTA.
- [ ] Cart buttons announce localized labels; Escape closes the mobile menu.
- [ ] `npx tsc --noEmit` passes (i18n key parity), `DELIVERY_PROVIDER=mock npm run build` and `npm run perf-budget` pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
