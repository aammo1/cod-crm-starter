# Task 24: Accessible accent foreground color

## Status

complete

## Wave

3

## Description

The accent color is used with hardcoded `text-white` on the main CTAs (`src/components/storefront/landing/inline-order-form.tsx:~211`, `src/components/storefront/landing/sticky-cta.tsx:~26`, `src/app/(storefront)/l/[slug]/page.tsx:~85`). The default accent `#d97706` on white is ~3.2:1, failing WCAG AA for normal text, and the wizard never checks contrast. Add `accentForeground` to the brand config (derived automatically like `primaryForeground`), expose it as a CSS variable and Tailwind token, and use it on accent buttons.

## Dependencies

**Depends on:** task-09-seo-structured-data.md, task-10-new-store-wizard-robustness.md, task-15-checkout-funnel-correctness.md
**Blocks:** task-30-abandoned-checkout-leads.md, task-33-consent-and-snap-pixel.md

**Context from dependencies:** Tasks 09, 10 and 15 finished editing `l/[slug]/page.tsx` + storefront `layout.tsx` (SEO metadata), `scripts/new-store.mjs` (slugs, cleanup ordering, https, `.template-version`) and `inline-order-form.tsx` / `sticky-cta.tsx` (checkout correctness, sticky price = total). This task now owns those files for theme-only changes.

## Files to Modify

- `src/config/schema.ts` — `accentForeground: hex` optional in brand colors (line ~18 has `primary, primaryForeground, accent`); after parse, default it to the better-contrast of `#ffffff` / `#111827` against `accent` (WCAG relative luminance).
- `store.config.ts` — set explicit `accentForeground` for the default theme if the derived value is not ideal (e.g. darken accent to meet 4.5:1 with white, or use dark text).
- `src/app/(storefront)/layout.tsx` — add `--store-accent-fg:${bc.accentForeground}` to `themeCss` (~line 64).
- Tailwind theme mapping (find where `--store-accent` maps to a utility, e.g. `src/app/globals.css` `@theme` or `tailwind.config`) — add `store-accent-fg`.
- `inline-order-form.tsx`, `sticky-cta.tsx`, `l/[slug]/page.tsx` — replace `text-white` on accent backgrounds with `text-store-accent-fg`.
- `scripts/new-store.mjs` — compute `accentForeground`, print a French warning if neither white nor dark text reaches 4.5:1, and write it into the generated config.

## Files to Create

- `src/config/contrast.ts` — `relativeLuminance(hex)`, `contrastRatio(a, b)`, `bestForeground(bg)`; pure, no deps, usable from the wizard (the wizard is `.mjs`; either duplicate the ~20 lines in `scripts/new-store/` or import via the TS loader used by the wizard — check how the wizard validates config).
- `scripts/unit/contrast.test.mjs`

## Technical Details

Luminance: sRGB channel `c/255`, linearize `c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`, `L = 0.2126R + 0.7152G + 0.0722B`; ratio `(L1+0.05)/(L2+0.05)`.

Grep for other `bg-store-accent` + `text-white` combos (`grep -rn "store-accent" src`) and fix them all.

## Acceptance Criteria

- [ ] Every accent-background CTA uses `text-store-accent-fg`.
- [ ] Default theme CTA text contrast ≥ 4.5:1.
- [ ] Wizard warns on low contrast and writes `accentForeground`.
- [ ] Existing configs without `accentForeground` still validate (derived default).
- [ ] `DELIVERY_PROVIDER=mock npm run build`, `npm run perf-budget`, unit tests pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
