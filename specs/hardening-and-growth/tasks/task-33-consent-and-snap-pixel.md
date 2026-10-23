# Task 33: Consent banner and Snap Pixel

## Status

pending

## Wave

6

## Description

Meta and TikTok pixels load without any consent mechanism, and Snapchat — widely used in Morocco — is not supported. Add a lightweight, localized consent banner (Moroccan law 09-08 / CNDP friendly; neutral defaults) that gates all marketing pixels, and add the Snap Pixel (browser only) following the existing pixel component pattern with the shared `eventId`.

## Dependencies

**Depends on:** task-24-accent-foreground-theme.md, task-26-utm-attribution.md, task-30-abandoned-checkout-leads.md
**Blocks:** task-34-code-cleanup.md

**Context from dependencies:** Task 24 added `accentForeground` to `src/config/schema.ts` / `store.config.ts` and edited storefront `layout.tsx`. Task 26 edited `src/lib/storefront/track.ts` (first-touch UTM capture in localStorage `${storeSlug}-attribution`). Task 30 edited `src/config/i18n.ts`, `schema.ts`, `store.config.ts` (`leads.enabled`). This task owns those files now.

## Files to Create

- `src/components/storefront/tracking/consent-banner.tsx` — client, loaded with `next/dynamic` (or tiny inline component) to protect the JS budget.
- `src/components/storefront/tracking/snap-pixel.tsx`
- `src/lib/storefront/consent.ts` — `getConsent()`, `setConsent(granted: boolean)`, event `store:consent`; localStorage key `${storeSlug}-consent` `{ v: 1, granted, at }`.

## Files to Modify

- `src/config/schema.ts`, `store.config.ts` — `tracking.snapPixelId?: string`; `consent: { mode: "opt-in" | "notice" | "off" }` default `"notice"` (show banner, pixels load unless refused) — operator may choose `opt-in` (pixels only after accept).
- `src/config/i18n.ts` — banner strings fr/ar (`Nous utilisons des cookies pour mesurer nos publicités.`, `Accepter`, `Refuser`, `En savoir plus` → `/confidentialite`).
- `src/lib/storefront/track.ts` — every pixel call checks consent; queue events until consent resolved in `opt-in` mode; drop when refused. Add Snap events (`PAGE_VIEW`, `VIEW_CONTENT`, `ADD_CART`, `START_CHECKOUT`, `PURCHASE` with `client_dedup_id = eventId`, `price`, `currency: "MAD"`).
- `src/components/storefront/tracking/*` existing Meta/TikTok pixel components — don't inject scripts until allowed.
- `src/app/(storefront)/layout.tsx` — mount banner and Snap pixel.
- `src/app/(storefront)/confidentialite/page.tsx` — mention pixels and how to withdraw consent (fr/ar from config/i18n).

## Technical Details

- Server-side CAPI (Meta/TikTok) currently runs from checkout attribution. In `opt-in` mode with consent refused, the browser must not send `fbp/fbc/ttp` attribution; the server-side purchase event then lacks browser ids — acceptable. Do **not** change server workers.
- Snap Pixel base code loads `https://sc-static.net/scevent.min.js`; inject only after consent and only when `snapPixelId` set.
- Budget: banner + consent logic must keep first-load JS ≤ 122,880 B gzip on product and landing pages (`npm run perf-budget`).
- Accessibility: banner is a `role="region"` with `aria-label`, buttons focusable, doesn't cover the sticky CTA (position above it on mobile).

## Acceptance Criteria

- [ ] `opt-in`: no pixel network requests before Accept; after Accept, pixels load and queued PageView fires once.
- [ ] Refuse persists and suppresses pixels.
- [ ] Snap pixel fires Purchase with the same `eventId` as Meta/TikTok.
- [ ] fr/ar complete; `npm run perf-budget` passes.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
