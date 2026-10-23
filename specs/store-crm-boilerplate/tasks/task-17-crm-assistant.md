# Task 17: Preserve the optional read-only CRM assistant

## Status
complete

## Wave
7

## Description

Retain the existing optional admin CRM assistant with generic catalog/order/stock data and neutral store context. This is adaptation of an existing feature, not new AI functionality. Work in `/home/tal7a/Projects/cod-crm-starter`; no paid credentials are required for startup or local verification.

## Dependencies

**Depends on:** task-14-fulfillment.md, task-15-order-workspace.md
**Blocks:** task-20-release-integration.md

**Context from dependencies:** Generic order/stock/fulfillment DTOs use stable IDs/options/SKU/labels and immutable snapshots. CRM shell remains admin-only assistant mounting, safe settings provide store name. Source assistant uses `assistant-data.ts`/`assistant-investigation.ts` and may contain SQL joins to color/size. Adapt those without changing service permissions.

## Files to Create

- None required.

## Files to Modify

- `src/lib/services/{assistant-data,assistant-investigation}.ts`
- `src/app/api/crm/assistant/route.ts`
- `src/components/crm/assistant-answer.tsx` only for generic structured response fields.
- `scripts/assistant-workflow.test.mjs` and its scenario fixtures.

## Technical Details

1. Replace shoe/category/brand assumptions in query joins, tools, data schema and prompts with generic options/label/SKU and current safe store name. Preserve accurate dashboard/stock/order/return attribution and source limits.
2. Keep strictly read-only server tools, admin-only route/session/origin handling, bounded queries/results and redacted output. Do not add mutation tools, execute arbitrary SQL from model text, expose courier keys or permit cross-store data.
3. `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` stay optional runtime server configuration; unset yields current clear French unavailable behavior, not startup failure. Preserve current AI SDK approach; use applicable AI SDK skill when actually editing API usage.
4. Fixtures use generic/default variants, no network to real provider. Preserve existing guard/accuracy assertions and run `npm run test:assistant`, `npm run lint`, `npx tsc --noEmit` in target.

## Acceptance Criteria

- [ ] Existing assistant can explain generic stock/orders/returns without shoe-only SQL or brand prompt.
- [ ] Admin-only/read-only boundaries unchanged; optional credentials not required to boot.
- [ ] Existing assistant regressions pass offline/with their existing provider mock.
