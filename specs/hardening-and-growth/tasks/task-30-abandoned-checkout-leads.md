# Task 30: Abandoned checkout leads (opt-in)

## Status

complete

## Wave

5

## Description

Shoppers often type their name and phone and then leave. Agents can recover many of these by calling. Add an **opt-in** (`store.config.ts` → `leads.enabled`, default `false`) lead capture: when the form has a valid name + phone and the shopper hasn't submitted within 20 s or leaves the page, the browser posts a lead; a successful checkout for the same phone marks the lead converted. Agents see open leads in `Paniers abandonnés` and can convert one into a manual order.

## Dependencies

**Depends on:** task-24-accent-foreground-theme.md, task-25-customer-order-tracking-page.md, task-26-utm-attribution.md, task-27-cod-remittance.md
**Blocks:** task-33-consent-and-snap-pixel.md

**Context from dependencies:** Task 24 finished theme edits in `inline-order-form.tsx`, `src/config/schema.ts` and `store.config.ts` (added `accentForeground`). Task 25 finished edits to `src/config/i18n.ts`. Task 27 added `Encaissements` to `crm-nav.tsx`/`crm-mobile-nav.tsx`. Task 15 (earlier) established the checkout attempt logic in `use-checkout.ts` — do not change it here. This task owns all of those files now.

## Files to Create

- `migrations/027_checkout_leads.sql`
- `src/lib/services/checkout-leads.ts` — `recordLead`, `listOpenLeads`, `markLeadsConverted(phone, orderId)`, `dismissLead`.
- `src/app/api/store/leads/route.ts` — `POST` (same-origin browser route).
- `src/app/api/crm/leads/route.ts` — `GET` list (agents/admins).
- `src/app/api/crm/leads/[id]/route.ts` — `PATCH { action: "dismiss" | "contacted" }`.
- `src/app/(admin)/crm/paniers/page.tsx`
- `src/components/crm/leads-workspace.tsx` — list with call/WhatsApp links and `Créer la commande` (opens `/crm/orders/new?leadId=…` prefilled — the manual order page reads `leadId` if feasible without modifying the manual order form heavily; otherwise copy name/phone to clipboard).
- `src/components/storefront/funnel/use-lead-capture.ts` — client hook.
- `scripts/unit/checkout-leads.test.mjs`

## Files to Modify

- `src/config/schema.ts`, `store.config.ts` — `leads: { enabled: boolean }` default false.
- `src/config/i18n.ts` — consent notice string fr/ar: `En saisissant votre numéro, vous acceptez d'être rappelé(e) au sujet de votre commande.` / `بإدخال رقمك، توافق على أن نتصل بك بخصوص طلبك.`
- `src/components/storefront/landing/inline-order-form.tsx`, `src/components/storefront/funnel/checkout-modal.tsx` — use the hook when enabled; render the notice under the phone field when enabled.
- `src/components/crm/crm-nav.tsx`, `crm-mobile-nav.tsx` — `{ href: "/crm/paniers", label: "Paniers abandonnés" }` (agents + admins).
- `src/app/api/store/checkout/route.ts` — after a successful (201) checkout, call `markLeadsConverted(phone, orderId)`. Do **not** edit `src/lib/services/storefront-orders.ts` (task 29 edits it in the same wave). The checkout route was last edited by task 26 (Wave 4); no other Wave 5 task touches it.

## Technical Details

### Migration 027

```sql
CREATE TABLE IF NOT EXISTS checkout_leads (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,                       -- normalized +212…
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  items_json TEXT NOT NULL CHECK (json_valid(items_json)),   -- [{variantId, qty}] only, no prices
  source_path TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','contacted','converted','dismissed')),
  converted_order_id TEXT REFERENCES orders(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON checkout_leads(phone, status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON checkout_leads(status, created_at);
```

### Rules

- Upsert one open lead per phone within 24 h (update name/items/updated_at).
- `POST /api/store/leads` uses `guardStoreRequest` origin checks and budgets (scope `store-lead`: 10/min per IP, 300/min global), body ≤ 8 KiB, server-side `normalizeMaPhone`, item variant ids must exist and be active (prices never accepted). Returns 204 always on valid input (no info leak). When `leads.enabled` is false, return 404.
- Browser: send with `navigator.sendBeacon` on `pagehide`/`visibilitychange=hidden`, or `fetch(..., { keepalive: true })` after 20 s idle; at most once per payload change; never when a checkout attempt is in flight or succeeded. Do not import zod; validate with `normalizeMaPhoneClient`.
- Converted: after checkout 201, `markLeadsConverted(phone, orderId)` (best-effort, outside the order transaction; failures logged, never affect the checkout response).
- Retention: leads older than 30 days are deleted by a lightweight cleanup run on list access (or in an existing worker tick) — document.
- CRM copy French; storefront copy fr/ar.

## Acceptance Criteria

- [ ] With `leads.enabled: false` nothing is sent and the endpoint 404s.
- [ ] With it enabled, typing valid name+phone then leaving creates one open lead; ordering marks it converted.
- [ ] Agents see, dismiss and act on leads.
- [ ] `npm run perf-budget` passes; unit tests pass.

## Notes

Legal review of the notice copy is listed in action-required.md.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
