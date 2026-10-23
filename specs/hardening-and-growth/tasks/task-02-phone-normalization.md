# Task 02: One shared Moroccan phone normalizer for browser and server

## Status

complete

## Wave

1

## Description

The browser check `src/components/storefront/funnel/phone.ts` accepts `[5-7]` (05 landlines) while the server `src/lib/phone.ts` (`normalizeMaPhone`) accepts only `[67]`. A shopper typing 05… passes the form, then the server rejects the whole request as `INVALID_REQUEST` and the UI shows a generic error — a lost order. Neither side accepts Arabic-Indic digits (٠-٩, ۰-۹), `+212 0 6…` or `002120…`. Make one dependency-free normalizer used by both, and make the checkout route return a specific `INVALID_PHONE` code so the UI can show the phone error (task 15 maps it).

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-15-checkout-funnel-correctness.md, task-16-rate-limit-availability.md

**Context from dependencies:** None.

## Files to Create

- `src/lib/phone-core.ts` — browser-safe pure normalizer (no imports at all).
- `scripts/unit/phone.test.mjs` — unit tests.

## Files to Modify

- `src/lib/phone.ts` — `normalizeMaPhone` delegates to `phone-core`; keep `toOzonPhone` and existing zod schema exports (this file imports `z` from `./validation`, so it must never be imported by storefront client code).
- `src/components/storefront/funnel/phone.ts` — `normalizeMaPhoneClient` delegates to `phone-core` (same signature; returns `+2126XXXXXXXX` or null).
- `src/app/api/store/checkout/route.ts` — when `storefrontCheckoutSchema` fails and the only/first issue path is `customer.phone`, return `storeError("INVALID_PHONE", "Numéro de téléphone invalide.", 400)` instead of `INVALID_REQUEST`.

## Technical Details

### Normalization rules (phone-core.ts)

1. Convert Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits to ASCII.
2. Strip spaces, NBSP, dots, dashes, parentheses, slashes.
3. Accept prefixes: `+212`, `00212`, `212`, `0`; also tolerate a redundant `0` after the country code (`+2120612…`, `002120612…`).
4. National significant number must match `^[67]\d{8}$` (mobile only — COD agents call mobiles; 05 landlines rejected on both sides).
5. Output E.164 `+212XXXXXXXXX`.

```ts
export function normalizeMaPhoneCore(raw: string): string | null {
  const ascii = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  const cleaned = ascii.replace(/[\s .\-()/]/g, "");
  const m = cleaned.match(/^(?:\+212|00212|212)0?([67]\d{8})$/) ?? cleaned.match(/^0([67]\d{8})$/);
  return m ? `+212${m[1]}` : null;
}
```

### Tests

Accept: `0612345678`, `06 12 34 56 78`, `+212612345678`, `+212 0612345678`, `00212612345678`, `002120712345678`, `212712345678`, `٠٦١٢٣٤٥٦٧٨`, `۰۶۱۲۳۴۵۶۷۸`. Reject: `0512345678`, `061234567`, `06123456789`, `+33612345678`, empty. Assert client and server functions return identical results for every case.

### Bundle constraint

`phone-core.ts` must not import anything (no zod, no libphonenumber-js) — the storefront first-load JS budget is 122,880 B gzip.

## Acceptance Criteria

- [ ] Browser and server accept/reject exactly the same inputs.
- [ ] Arabic-Indic digits are accepted.
- [ ] Checkout with an invalid phone returns HTTP 400 `{ code: "INVALID_PHONE" }`.
- [ ] `node --test scripts/unit/phone.test.mjs` and `npm run test:crm` pass.

## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
