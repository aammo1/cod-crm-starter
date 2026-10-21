# Task 19: Package deployment and coding-agent integration guides

## Status
pending

## Wave
7

## Description

Make the CRM-only template independently deployable and easy to reuse for each new niche. Write accurate setup/operations and coding-agent instructions in `/home/tal7a/Projects/cod-crm-starter`. Preserve the working Docker/SQLite/worker architecture rather than introducing another platform dependency.

## Dependencies

**Depends on:** task-13-settings-shell.md, task-14-fulfillment.md, task-16-storefront-client.md
**Blocks:** task-20-release-integration.md

**Context from dependencies:** Neutral CRM settings/admin navigation exist; generic mock fulfillment retains durable jobs/BL/reconciliation/returns. Client/examples implement authenticated v1 catalog, price-free idempotent checkout and order-token-bound upsell. Each template-generated store owns its own repo/deployment/SQLite/uploads/secrets and does not automatically update from template.

## Files to Create

- `docs/storefront-integration.md` — definitive API/client/agent guide.
- `docs/template-upgrades.md` — deliberate upgrade/cherry-pick/review workflow for independent copies.

## Files to Modify

- `README.md`, `AGENTS.md`, `docs/operations.md`
- `.env.example`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.gitignore`
- `scripts/create-user.mjs`, `scripts/backup-db.mjs` if default paths/branding require portability.

## Technical Details

1. README: public `aammo1/cod-crm-starter`, GitHub **Use this template**, CRM-only purpose, install `npm install`, dev `npm run dev`, lint/typecheck/build commands, empty DB defaults, first-admin `node scripts/create-user.mjs <email> <password> <name> admin`, optional agents and no seeded credentials. Do not hardcode source account/store data.
2. Compose service `crm`, port3000, persistent volume `/app/data`, `DB_PATH=/app/data/crm.db`, `UPLOAD_DIR=/app/data/uploads`. Unique volume/project and secrets per store. Preserve native better-sqlite3 build needs, standalone Next output, runtime migrations, health/worker heartbeat behavior and nonroot permissions as existing image supports. No SQLite initialization during build. Document backups/off-host retention and restore verification.
3. CRM env: `AUTH_SECRET`, `CRM_PUBLIC_URL`, `STOREFRONT_API_KEY` (>=32), `DB_PATH`, `UPLOAD_DIR`, exact `SECURITY_ALLOWED_ORIGINS`, opt-in `SECURITY_TRUSTED_IP_HEADER`; Ozon `OZON_CLIENT_ID`, `OZON_API_KEY`, `OZON_BASE_URL`, `OZON_USE_CUSTOM_TRACKING`, `OZON_SUBMIT_INTERVAL_SEC`, `OZON_POLL_INTERVAL_MIN`, `OZON_TRACK_BATCH`, `DELIVERY_PROVIDER=mock` locally; optional `CATALOG_AGENT_KEY`, existing Meta/assistant runtime vars. No actual secrets or `WEBHOOK_URL`; no hardcoded Zehri origins. Describe unset optional capabilities.
4. Storefront env only on its server: `CRM_BASE_URL`, `CRM_STOREFRONT_KEY`. Guide all catalog/checkout/upsell shapes, server-computed prices, stable attempt keys and response replay/409 rules, absolute media origin/Next Image, zero-stock checkout policy, two-field checkout and agent address collection, token binding/expiry, error handling and original attribution forwarding. AUTH_SECRET rotation invalidates outstanding derived tokens; document planned rotation handling.
5. `AGENTS.md`: explicit CRM source-of-truth/integration boundaries, generic model/no client price, French/MAD, stable variant history, sole inventory writer, transactional close/reserve/queue, BL uncertain-operation reconciliation, Ozon URL redaction, mock-only development, required check commands. Include a ready prompt for a future storefront coding agent to read the integration guide and copy typed client, preserving server-only secrets.
6. Operations: separate stores, no shared SQLite/uploads/secrets, disable mock only after owner-provided Ozon setup/verification. Keep read-only owner-gated live verification instructions but don't execute it. Startup empty catalog and optional services require no production credentials. Template updates manual, schema upgrades backed up/reviewed; no automatic upstream replacement.
7. Ignore env/local keys/data/backups/uploads/build/browser artifacts; ensure Docker context excludes them. Run available config/build checks, `npm run lint`, `npx tsc --noEmit` and `npm run build`. Local smoke with throwaway mock volume if Docker is available; report tooling absence accurately.

## Acceptance Criteria

- [ ] Fresh user can create an admin, deploy persistent empty CRM and connect a custom storefront from docs.
- [ ] Config/env defaults neutral, secrets blank and isolated per-store.
- [ ] Agent guide matches actual v1/types/examples and operational invariants.
- [ ] Public template/update limitations and live onboarding actions clearly documented.
