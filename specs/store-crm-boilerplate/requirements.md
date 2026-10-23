# Requirements: Standalone COD CRM Starter

## Summary

The owner operates Moroccan cash-on-delivery stores in different niches and builds custom storefronts from scratch, often with Next.js and coding agents. Rebuilding Zehri's CRM for every storefront is wasteful. Extract its operational backend and CRM UI into a reusable **CRM-only** project with a documented storefront connection.

Publish the result as **`https://github.com/aammo1/cod-crm-starter`**, a **public GitHub template repository**. Every new store uses the template to create an independent repository, CRM deployment, database, media storage, users, credentials and stock. This is not a multi-store shared CRM. Template-generated repositories do not automatically receive upstream updates; document deliberate upgrade handling.

## Goals

- Preserve Zehri's familiar French CRM and operational behavior: new order, optional upsell, agent contact/confirmation, reservation, durable courier submission, BL, handoff, tracking, delivery/return, inspection and inventory movements.
- CRM is the source of truth for product IDs, flexible variants, images, prices, stock, shipping calculations and order totals. The custom storefront owns presentation and customer interaction.
- Support shoes, beauty, gadgets and other niches without requiring colors/numeric sizes: arbitrary named options and a single default variant where no options exist.
- Enable easy agent-assisted integration through a typed server-side client, Next.js examples and an explicit API contract.
- Preserve existing team administration, manual orders, edits/history, archiving, dashboard, reconciliation and optional assistant/catalog automation capabilities.
- Provide a clean fresh installation, Docker persistence, admin creation and SQLite backup instructions.

## Non-Goals

- Shared multi-tenant CRM, Shopify/YouCan connectors, storefront design or customer-facing pages in the starter.
- Migrating Zehri production data or changing/deploying Zehri itself.
- Automatic synchronization of independently generated CRM repositories.
- New couriers, payments, Google Sheets or webhook automation. Initial courier is Ozon with local mock mode.
- A newly invented upsell/discount system: preserve the existing offer selection and 20-second/30% behavior, add per-store enable/disable and configuration with safe bounds.
- Shipping live parcels or verifying live Ozon statuses as part of implementation.

## Acceptance Criteria

- [ ] Public repository `aammo1/cod-crm-starter` exists with `isTemplate: true`, fresh history and no source data/credentials/uploads.
- [ ] Each template instance starts empty, supports first admin creation and persists independently; no boot-time demo catalog or users.
- [ ] No Zehri domains, fixed category enum, required color, numeric shoe-size parser or `ZEHRI` warehouse default remains in runtime behavior.
- [ ] Products with two options, a non-size option and no options all support create/edit/archive/restore, stock, checkout, confirmation, shipping and returns.
- [ ] Published products/variants have stable IDs/SKUs; edits never destroy inventory/history references. Historical order names/options/prices remain snapshots.
- [ ] Authenticated v1 API exposes catalog, idempotent order creation and order-scoped upsell resolution. No admin/session access is granted by storefront credentials.
- [ ] Checkout requires only customer name and Moroccan phone plus cart lines; address/city remain agent-confirmation concerns. No client-supplied prices are trusted.
- [ ] Zero available stock does not reject a valid active variant at checkout; confirmation atomically checks/reserves stock and queues submission.
- [ ] Defaults are 29 MAD shipping, free shipping at 400 MAD, optional enabled 20-second upsell at 30% off, French and `Africa/Casablanca`.
- [ ] Duplicate checkout requests, retries after process failure and concurrent upsell/confirmation do not duplicate orders, discounts, jobs, stock movements or Meta purchases.
- [ ] Existing CRM safeguards, reconciliation paths, unknown tracking-status handling and admin/agent permissions are preserved.
- [ ] Integration examples run with server-only credentials and preserve browser public checkout abuse limits.
- [ ] Lint, typecheck, production build and relevant adapted existing regressions pass; complete local mock order/return journey and fresh deployment work.

## Assumptions and chosen defaults

- Source workspace: `/home/tal7a/Projects/zehri`; implementation workspace: `/home/tal7a/Projects/cod-crm-starter`. Verify the parent and absence of conflicting user work before creating it.
- GitHub identity `aammo1` was authenticated during planning; recheck before publication. The public name/visibility is approved; do not substitute another destination if occupied.
- Retain Next.js App Router, React, TypeScript, Auth.js credentials/admin-agent roles, SQLite/better-sqlite3 and the existing UI/design system.
- Single deployment/process owner per store's SQLite file with durable persistent storage; do not put SQLite on ephemeral build storage.
- Currency remains integer MAD, product-level price shared by variants in v1 (no variant-specific pricing requirement).
- Categories become editable string metadata, not a fixed shoe enum. Product content can retain optional story/materials/badge fields for compatibility.
- Existing optional Meta CAPI, read-only CRM assistant and catalog agent remain disabled when unconfigured; no browser Pixel is mounted in CRM pages. Do not require paid AI/API services to boot.
- API and schema specifics below are implementation decisions resolving details not selected explicitly by the owner; keep their semantics consistent across tasks.

## Technical Constraints

### Generic model

Use `src/lib/commerce-types.ts` for shared, browser-safe types. A variant has `{ id, productId, sku, label, options: [{ name, value }], images, active, available }`. Options are ordered for display; canonical sorted/normalized option pairs form `options_key` unique within a product. An optionless product has exactly one default variant with `options: []`. Product names/slugs/SKUs and duplicate option combinations are validated. Archived variants remain referenced by history; new IDs are never assigned to existing variants on edit.

Generic order lines contain `{ product_id, variant_id, sku, name, variant_label, options, quantity, unit_price, line_total }` snapshots. Prices come from CRM catalog or the persisted upsell offer. Generic types use strings for option values; never coerce `"36"`, `"XL"` or `"500 ml"` into numbers.

This is a new database lineage, not an in-place migration for live Zehri. Adapt the copied starter's baseline/migrations to support generic variants while preserving all operational tables/constraints from migrations 001–015. Source migrations are untouched. Transitional legacy columns/helpers are permitted only until task 20 removes runtime dependencies.

### Store configuration

Store safe settings in existing `app_state` through a typed server service: `storeName`, `shippingFeeMad`, `freeShippingThresholdMad`, `upsellEnabled`, `upsellWindowSeconds`, `upsellDiscountPercent`. Defaults: `COD CRM`, 29, 400, true, 20, 30. Fees/threshold nonnegative integer MAD; window 1–300 seconds; discount 1–90 percent. Currency/language/timezone fixed to MAD/fr/Africa-Casablanca in v1. Stable inventory location key `MAIN` is independent of display name. Store secret keys only in runtime env, never admin JSON/public catalog.

Changes affect new checkouts/offers; snapshots and replay responses retain original totals/offer expiry even if settings/catalog later change. Pure pricing helpers receive explicit rule values to avoid DB import cycles.

### API contract

All `/api/storefront/v1/*` endpoints require `Authorization: Bearer <STOREFRONT_API_KEY>`; credential is runtime-only, at least 32 random characters and absent configuration disables the surface. Credentials live on the storefront **server**, never in `NEXT_PUBLIC_*`, browser bundles or query strings. No cross-origin browser access is needed. `CRM_BASE_URL` is an absolute CRM origin; remote media URLs resolve against that origin.

- `GET /api/storefront/v1/catalog?cursor=...&limit=...`: `{ products, nextCursor, settings: { storeName, currency: "MAD", shippingFeeMad, freeShippingThresholdMad } }`; stable ID pagination, default 50/max 100. Include active products/variants, including zero-availability ones flagged explicitly, so direct pages can show sold-out status. Omit private inventory counts, costs, contacts and agent data. Public DTO availability is boolean, despite internal numeric availability.
- `GET /api/storefront/v1/catalog/[slug]`: `{ product }`, active product or 404.
- `POST /api/storefront/v1/orders`: header `Idempotency-Key` (8–128 safe ASCII characters); body `{ customer: { name, phone }, items: [{ variantId, qty }], meta? }`. Qty 1–10 per aggregated variant; 1–50 lines; strict price-free schema. Response `{ orderId, totals: { itemsSubtotal, shipping, total, currency: "MAD" }, upsellOffer: null | { offerId, productId, name, image, originalPrice, upsellPrice, expiresAt, variants: [{ variantId, label, options, available }] }, orderToken }`. First creation 201; identical replay 200 with the original response; same key/different canonical request 409. Error envelope `{ error: { code, message } }`, French messages.
- `POST /api/storefront/v1/orders/[id]/upsell`: headers `Idempotency-Key` and `X-Order-Token`; body `{ action: "accept", variantId }` or `{ action: "decline" }`. Response `{ orderId, upsellStatus, totals }`. Variant must belong to the stored offered product. Acceptance appends exactly one discounted unit; never trust a supplied price/offer. Stable same-action replays; conflicting action 409; closed/expired offers cannot mutate the order.

Persist order, its offer/deadline/token verifier, receipt and applicable durable event/job records in one immediate SQLite transaction. The request hash uses normalized name/phone, aggregated sorted variant quantities and validated attribution; never current catalog prices. Replay lookup precedes catalog/availability and per-phone new-order quota checks. Auth/global abuse protection still applies. Store request receipts durably; do not expire receipts into accidental duplicate creation. Store response's sensitive order token securely: derive it with keyed HMAC using a durable random per-order nonce plus `AUTH_SECRET` (do not log it); persist the exact replay response only if token-at-rest is encrypted, otherwise reconstruct using the stored nonce and response snapshot. Document secret rotation implications. An order token alone never bypasses storefront API authentication.

Upsell uses existing `upsellRef`, otherwise an available best seller not in cart. Agent confirmation atomically closes pending upsells; the CRM may confirm immediately rather than waiting for the window. Disabled/unavailable upsells return null and start closed. The deadline is server-enforced, not only a browser countdown. Opposite resolutions after closure conflict. An identical previously committed request returns its receipt even after later order changes.

### Operational invariants

- Server recomputes prices; orders/durable side effects exist before success.
- Confirmation closes upsells, reserves stock and queues a parcel atomically. Contact logs never reopen confirmed/cancelled orders.
- Inventory service is the only stock writer; keep physical/reserved/quarantine ledger and race protection.
- Parcel creation only by submission worker; BL creation/handoff explicit agent actions. BL claims and uncertain steps require recorded portal reconciliation, no blind retry/lease takeover.
- Tracking only by poller; unknown statuses never automatically change stock. Retain unverified Ozon status mappings as unverified.
- Use redaction helpers; Ozon secrets appear in URL paths and must never reach logs/errors/browser.
- Retain optional Meta durable event/outbox deduplication; attribution must be safely forwarded from the storefront request, not incorrectly inferred from the CRM connection. No extra tracking setup scope.
- No Google Sheets/WEBHOOK_URL reintroduction. All visible copy in French. Maintain mobile CRM ergonomics and admin/agent restrictions.

### Configuration and verification

Retain `DB_PATH`, `UPLOAD_DIR`, `AUTH_SECRET`, `SECURITY_ALLOWED_ORIGINS`, `SECURITY_TRUSTED_IP_HEADER`, `OZON_CLIENT_ID`, `OZON_API_KEY`, `OZON_BASE_URL`, `OZON_USE_CUSTOM_TRACKING`, `OZON_SUBMIT_INTERVAL_SEC`, `OZON_POLL_INTERVAL_MIN`, `OZON_TRACK_BATCH`, `DELIVERY_PROVIDER`, `CATALOG_AGENT_KEY`; optional Meta/assistant vars as existing capabilities need. Add `STOREFRONT_API_KEY`, `CRM_BASE_URL` (client), `CRM_STOREFRONT_KEY` (client), `CRM_PUBLIC_URL` (CRM canonical origin). Never embed actual keys.

Required release checks in the new workspace: `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:crm`, `npm run test:catalog-agent`, `npm run test:security`, `npm run test:meta`, `npm run test:assistant`. Adapt existing fixtures alongside relevant implementation tasks rather than keeping shoe-only fixtures. Existing storefront browser checks become CRM/integration-example checks if retained; no removed storefront is required to run. Use `DELIVERY_PROVIDER=mock` and isolated temp SQLite/media for verification.
