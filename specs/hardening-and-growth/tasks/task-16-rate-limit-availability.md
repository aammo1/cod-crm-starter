# Task 16: Rate limits that one client cannot use to block everyone

## Status

complete

## Wave

2

## Description

Without a trusted client-IP header only global buckets apply: `publicRequestBudget` in `src/lib/services/security-budgets.ts:63-71` (`checkout:global` 120/min), `src/lib/storefront/browser-guard.ts:21-27` (`store-checkout:global` 120/min, `store-upsell` 240/min). One script with a forged `Origin`/`Sec-Fetch-Site` header blocks every real customer. Login (`src/lib/services/credentials.ts:22`) counts `login:global` (300/min) on every attempt before any check, so ~5 req/s blocks all logins; `login:account` (10 failures/15 min, keyed by email only) lets anyone lock out an admin by email; and when more than 4 scrypt checks run concurrently `verifyPasswordAsync` (`src/lib/password.ts:27`) returns `false`, which is then counted as a failed attempt against the real user. The per-phone checkout budget (5/10 min) returns a bare 429 where an "already ordered" message would be better.

## Dependencies

**Depends on:** task-02-phone-normalization.md
**Blocks:** task-26-utm-attribution.md

**Context from dependencies:** Task 02 edited `src/app/api/store/checkout/route.ts` to return `INVALID_PHONE`; this task now owns that file. Task 04 (Wave 1) made production boot require either `SECURITY_TRUSTED_IP_HEADER` or the explicit acknowledgment `SECURITY_ACCEPT_GLOBAL_BUDGETS=1`.

## Files to Modify

- `src/lib/password.ts` — distinguish saturation from mismatch.
- `src/lib/services/credentials.ts` — budget order and keys.
- `src/lib/services/security-budgets.ts` — per-IP primary, global as high-water safety net; phone budget result code.
- `src/lib/storefront/browser-guard.ts` — same model for `store-checkout`/`store-upsell`.
- `src/app/api/store/checkout/route.ts` — map the per-phone budget to `429 { code: "PHONE_RECENTLY_ORDERED" }`.
- `scripts/security-workflow.test.mjs` — regression tests.

## Technical Details

1. **password.ts**: change `verifyPasswordAsync` to return `"ok" | "mismatch" | "busy"` (or add a new function and keep the boolean one for other callers — check all call sites with grep). Saturation → `"busy"`.
2. **credentials.ts**:
   - `busy` → return null **without** consuming failure budgets (Auth.js shows a generic error; acceptable).
   - Keep `login:global` as a hash-work cap but count it only for attempts that reach scrypt, and raise to 600/min; failures-only buckets as today.
   - When a trusted IP exists, key the account lockout as `login:account-ip:<email>:<ip>` (10/15 min) plus a looser `login:account:<email>` (50/15 min). Without IP, keep `login:account` at 10/15 min (documented trade-off).
3. **Checkout/upsell budgets**: when a trusted IP is available, per-IP limits are primary (`checkout:ip` 20/min, upsell 40/min) and the global limit becomes a safety net (raise to 600/min checkout, 1200/min upsell). Without IP, keep current globals (operator acknowledged via `SECURITY_ACCEPT_GLOBAL_BUDGETS=1`).
4. **Per-phone**: make the budget function return which bucket tripped (e.g. `{ limited: true, scope: "phone" | "ip" | "global", retryAfterSeconds }`) without changing callers' semantics elsewhere (grep usages of `consumeBudgets`/`publicRequestBudget`). Checkout maps `phone` → `PHONE_RECENTLY_ORDERED` with French message `Une commande récente existe déjà pour ce numéro. Un conseiller vous appellera.`; keep `Retry-After`.
5. Same changes apply to the external example's limiter? **No** — `examples/nextjs/lib/checkout-session.ts` stays as is; task 35 documents its limits.

### Tests

- With trusted IP header: IP A exhausting its budget doesn't block IP B.
- Login flood of wrong passwords for a non-existent email doesn't block a valid login from another IP.
- `busy` doesn't consume the account bucket (stub the concurrency limit).
- Per-phone limit returns `PHONE_RECENTLY_ORDERED`.

## Acceptance Criteria

- [ ] Behind a trusted proxy header, one IP cannot exhaust checkout or login for others.
- [ ] Correct passwords during saturation never count as failures.
- [ ] `npm run test:security` and `npm run test:crm` pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
