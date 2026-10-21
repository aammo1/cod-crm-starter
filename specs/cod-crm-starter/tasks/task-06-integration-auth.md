# Task 06: Add the server-to-server integration security boundary

## Status
pending

## Wave
3

## Description

Custom-coded storefront servers will connect to each independent CRM using a dedicated integration credential, separate from CRM user sessions and catalog-agent keys. Implement authentication/origin handling without weakening the existing browser/admin controls. Target workspace is `/home/tal7a/Projects/cod-crm-starter`.

## Dependencies

**Depends on:** task-03-store-configuration.md (and extracted app from task 01)
**Blocks:** task-09-catalog-api.md, task-11-order-api.md

**Context from dependencies:** Starter has Auth.js admin/agent authentication and copied security budgets/origin guards, some originally hardcoded to Zehri domains. Settings provide safe display/rule data, not secrets. New APIs will live only under `/api/storefront/v1/*`; HTTP endpoint tasks consume the helper added here.

## Files to Create

- `src/lib/storefront-auth.ts` — server-only bearer auth and French error envelope helpers.

## Files to Modify

- `src/lib/auth-guards.ts`, `src/middleware.ts` or root middleware file **if present**, `src/lib/services/security-budgets.ts`, and the existing origin-guard module reached from these files — make exact-origin config portable and carve out only authenticated integration routes.
- `scripts/security-workflow.test.mjs` — adapt existing security regression expectations and canonical origin fixture.

## Technical Details

1. Add runtime-only `STOREFRONT_API_KEY`, minimum 32 random characters. Validate a single Bearer header, constant-time credential comparison, fail closed when absent/malformed/short config. Never permit query-string keys, browser sessions as substitute, or `NEXT_PUBLIC` keys. Unconfigured API returns disabled/unavailable response; wrong key 401. Error shape `{ error: { code, message } }`, French visible messages.
2. Expose reusable `requireStorefrontApi(request)` returning authorization/error plus global budget handling. Authenticated API key confers only v1 catalog/order permissions, never `/api/admin`, `/api/crm`, team, stock or catalog-agent access. Retain separate `CATALOG_AGENT_KEY` semantics.
3. Remove implicit `zehri.ma`/`www.zehri.ma` origin allowlisting. Use `CRM_PUBLIC_URL` plus exact `SECURITY_ALLOWED_ORIGINS` for browser mutations. Keep Auth.js CSRF/session/role protections. Server-to-server routes may omit browser Origin, but only the v1 boundary gets that behavior, authenticated before processing.
4. No CORS wildcard/direct browser integration. Do not trust storefront-supplied proxy IP headers on the CRM network. Preserve `SECURITY_TRUSTED_IP_HEADER` deployment opt-in for actual trusted proxies. Keep bounded JSON bodies and shared/account/phone budgets. New-order per-phone budget must be applied after receipt replay lookup; coordinate helper interface with task 11 rather than spending quota on identical retries.
5. Verify unauthorized/disabled/malformed auth, exact-origin browser rejection, agent/admin separation and no key-in-response behavior using adapted security regressions and `npm run lint`, `npx tsc --noEmit`. No network to production.

## Acceptance Criteria

- [ ] Server-only credential gates only v1 endpoints with no admin escalation.
- [ ] Copied Zehri origins are gone from effective security policy.
- [ ] Browser session/role/CSRF controls remain intact.
- [ ] Existing security suite covers the portable origin and API boundary; logs contain no secrets.
