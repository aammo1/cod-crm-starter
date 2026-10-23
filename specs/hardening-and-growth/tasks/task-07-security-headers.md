# Task 07: Security headers (HSTS, CSP hardening)

## Status

complete

## Wave

1

## Description

`next.config.ts:47-55` sets only `frame-ancestors` in CSP. There is no HSTS, `object-src`, `base-uri` or `form-action`. Add low-risk headers globally and a stricter policy for `/crm` and `/admin`, without breaking Next.js inline bootstrapping, pixels (Meta/TikTok on the storefront) or the image optimizer.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** None

**Context from dependencies:** None.

## Files to Modify

- `next.config.ts` — extend `headers()`.

## Technical Details

1. Global (all routes): `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` (merge with whatever already exists; keep existing `frame-ancestors` value). `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` if not already set.
2. HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains` only when `process.env.CRM_PUBLIC_URL` starts with `https://` at build/start time (read in `next.config.ts`). Note: `headers()` is evaluated at build; document in a code comment that HSTS follows the build-time `CRM_PUBLIC_URL` and that proxies may also set it. If `CRM_PUBLIC_URL` is unavailable at build, skip HSTS (do not break `DELIVERY_PROVIDER=mock npm run build`).
3. `/crm/:path*`, `/admin/:path*`, `/login`: add `script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:` (nonce-based CSP is out of scope; Next inline runtime needs `'unsafe-inline'` without nonces). Verify the CRM assistant (which calls the server, not OpenRouter directly from the browser) still works — check `src/components/crm/crm-assistant.tsx` fetch targets.
4. Do not add a script-src to storefront routes (pixels load third-party scripts).
5. Keep `/api/media/[...path]` route-level `sandbox` CSP intact (it is set in the route handler).

## Acceptance Criteria

- [ ] `curl -I` against `DELIVERY_PROVIDER=mock npm run start` shows the new headers on `/`, `/crm/login`-like routes and `/api/health`.
- [ ] CRM pages load without CSP console errors (check with `npm run test:e2e-crm` if available locally, else manual Playwright smoke via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`).
- [ ] Storefront pixels are unaffected.
- [ ] `DELIVERY_PROVIDER=mock npm run build` and `npm run perf-budget` pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
