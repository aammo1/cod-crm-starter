# Task 23: Daily ad spend entry

## Status

complete

## Wave

3

## Description

COD operators judge campaigns by cost per confirmed/delivered order and ROAS. Add an admin page `Dépenses pub` to enter daily ad spend per channel (Meta, TikTok, Snap, Google, Autre), optionally per campaign (matching `utm_campaign` values captured by task 26), and a service the dashboard (task 31) reads.

## Dependencies

**Depends on:** None functionally; placed in Wave 3 to serialize CRM nav edits.
**Blocks:** task-27-cod-remittance.md (next nav owner), task-31-dashboard-kpis.md

**Context from dependencies:** None required.

## Files to Create

- `migrations/023_ad_spend.sql`
- `src/lib/services/ad-spend.ts` — `listAdSpend({ from, to })`, `upsertAdSpend`, `deleteAdSpend`, `adSpendTotals({ from, to, groupBy: "channel" | "campaign" | "day" })`.
- `src/app/api/crm/ad-spend/route.ts` — `GET` (range), `POST` upsert.
- `src/app/api/crm/ad-spend/[id]/route.ts` — `DELETE`.
- `src/app/(admin)/crm/depenses/page.tsx` — server page, admin only.
- `src/components/crm/ad-spend-workspace.tsx` — client form + table (mobile-friendly).
- `scripts/unit/ad-spend.test.mjs`

## Files to Modify

- `src/components/crm/crm-nav.tsx` — `{ href: "/crm/depenses", label: "Dépenses pub", adminOnly: true }`.
- `src/components/crm/crm-mobile-nav.tsx` — same entry (follow its structure).

## Technical Details

### Migration 023

```sql
CREATE TABLE IF NOT EXISTS ad_spend (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), -- Africa/Casablanca calendar day
  channel TEXT NOT NULL CHECK (channel IN ('meta','tiktok','snap','google','other')),
  campaign TEXT NOT NULL DEFAULT '' CHECK (length(campaign) <= 200),
  amount INTEGER NOT NULL CHECK (amount >= 0),       -- MAD, integer
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (day, channel, campaign)
);
CREATE INDEX IF NOT EXISTS idx_ad_spend_day ON ad_spend(day);
```

### Rules

- Upsert on `(day, channel, campaign)`.
- Amount input in MAD integers (if the operator pays in USD they convert; show helper text `Montant en MAD (convertissez si votre compte est en USD).`).
- Admin only (`requireAdmin`); bodies via `readLimitedJson` (16 KiB); zod.
- Days are Casablanca calendar dates; default the form to today in Africa/Casablanca (reuse helpers in `src/lib/services/orders.ts` like `formatCasablanca` or `Intl.DateTimeFormat("fr-MA", { timeZone: "Africa/Casablanca" })`).
- French copy throughout.

## Acceptance Criteria

- [ ] Admin can add/edit/delete spend per day/channel/campaign; agents get 403 and don't see the nav entry.
- [ ] `adSpendTotals` returns correct sums for a date range and grouping.
- [ ] Unit tests pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
