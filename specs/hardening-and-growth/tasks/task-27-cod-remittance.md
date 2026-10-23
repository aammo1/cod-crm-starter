# Task 27: COD remittance reconciliation

## Status

complete

## Wave

4

## Description

`orders.cod_status` (`migrations/001_init.sql:105`, default `awaiting_payment`) is never written. The operator cannot see which delivered parcels the courier has paid out. Add remittance batches: import a courier statement CSV (or select delivered orders manually), match by tracking number, flag amount mismatches, mark matched orders `paid`, and show delivered-but-unpaid aging.

## Dependencies

**Depends on:** task-12-delivery-outcomes.md, task-23-ad-spend.md
**Blocks:** task-30-abandoned-checkout-leads.md (next nav owner), task-31-dashboard-kpis.md

**Context from dependencies:** Task 12 added `orders.delivery_outcome` (`delivered|refused`) + `_at/_by/_source`, set by agents or tracking. Task 23 added the `Dépenses pub` entry to `src/components/crm/crm-nav.tsx` and `crm-mobile-nav.tsx`; this task now owns the nav files.

## Files to Create

- `migrations/025_cod_remittances.sql`
- `src/lib/services/cod-remittances.ts`
- `src/lib/csv.ts` — small RFC 4180 parser (quoted fields, `;` or `,` delimiter auto-detect, BOM strip) and writer helpers (writer used later by task 32; include `escapeCsvCell` with formula-injection protection: prefix `'` when a cell starts with `=`, `+`, `-`, `@`, tab or CR).
- `src/app/api/crm/remittances/route.ts` — `GET` list, `POST` create from CSV text (preview or commit) or from selected order ids.
- `src/app/api/crm/remittances/[id]/route.ts` — `GET` detail, `DELETE` (admin, only if created < 24 h ago; reverts orders to `awaiting_payment`).
- `src/app/(admin)/crm/encaissements/page.tsx` — admin page.
- `src/components/crm/remittance-workspace.tsx` — upload/paste CSV, column mapping, preview, commit; unpaid aging table.
- `scripts/unit/cod-remittances.test.mjs`, `scripts/unit/csv.test.mjs`

## Files to Modify

- `src/components/crm/crm-nav.tsx`, `src/components/crm/crm-mobile-nav.tsx` — `{ href: "/crm/encaissements", label: "Encaissements", adminOnly: true }`.

## Technical Details

### Migration 025

```sql
CREATE TABLE IF NOT EXISTS cod_remittances (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL CHECK (length(reference) BETWEEN 1 AND 120),
  received_on TEXT NOT NULL,                 -- Casablanca date YYYY-MM-DD
  declared_total INTEGER CHECK (declared_total IS NULL OR declared_total >= 0),
  fees_total INTEGER NOT NULL DEFAULT 0 CHECK (fees_total >= 0),
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cod_remittance_lines (
  remittance_id TEXT NOT NULL REFERENCES cod_remittances(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id),
  tracking_number TEXT,
  expected_amount INTEGER NOT NULL,          -- orders.total at match time
  paid_amount INTEGER NOT NULL CHECK (paid_amount >= 0),
  fee_amount INTEGER NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  PRIMARY KEY (remittance_id, order_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_remittance_lines_order ON cod_remittance_lines(order_id);
ALTER TABLE orders ADD COLUMN cod_paid_at TEXT;
```

### Rules

- `cod_status` values used: `awaiting_payment` (default), `paid`, `not_applicable` (refused/cancelled). Set `not_applicable` lazily in queries rather than writing it for refused orders (optional write when delivery outcome is refused — do not modify task 12's service; compute in reports).
- CSV import flow: parse → mapping (`trackingColumn`, `amountColumn`, optional `feeColumn`; defaults guess headers containing `code|suivi|tracking` and `montant|amount|crbt`), amounts parsed as MAD integers (accept `1 234,00` / `1234.00`; reject non-integer centimes ≠ 0 with a warning row).
- Match by `courier_submissions.tracking_number` (status `submitted`). Unmatched rows and amount mismatches (`paid + fee ≠ order.total`) shown in preview; commit only includes matched rows the admin keeps checked.
- Commit in one `.immediate()` transaction: insert remittance + lines, set `orders.cod_status='paid'`, `cod_paid_at`. Orders already in a remittance → skipped (unique index).
- Only orders with `delivery_outcome='delivered'` may be marked paid; if a statement includes an order without outcome, offer `Marquer livré et payé` which calls `setDeliveryOutcome(orderId, "delivered", actor, "agent")` from `src/lib/services/delivery-outcomes.ts` first (same transaction is not possible if that function opens its own transaction — call it before, per order, then commit the remittance).
- Body limit 1 MiB for CSV posts (`readLimitedJson` or text equivalent); admin only.
- Aging view: delivered & awaiting_payment grouped `0–7 j`, `8–15 j`, `16–30 j`, `> 30 j` by `delivery_outcome_at`.

## Acceptance Criteria

- [ ] Importing a CSV marks matched delivered orders paid and records fees and mismatches.
- [ ] Re-importing the same statement doesn't double-pay.
- [ ] Aging table shows unpaid delivered orders.
- [ ] CSV parser handles quotes, `;`, BOM; writer escapes formulas.
- [ ] Unit tests pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
