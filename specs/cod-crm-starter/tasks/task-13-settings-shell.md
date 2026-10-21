# Task 13: Add store settings and neutral CRM navigation

## Status
pending

## Wave
5

## Description

Make a fresh CRM feel like the owner's new store rather than Zehri, and provide an admin interface to delivery/upsell rules. Preserve the familiar French/mobile CRM design in `/home/tal7a/Projects/cod-crm-starter`.

## Dependencies

**Depends on:** task-03-store-configuration.md, task-08-catalog-management.md
**Blocks:** task-19-deployment-guides.md

**Context from dependencies:** Typed settings service stores validated safe settings in `app_state`, defaults `COD CRM`, shipping29/free400, enabled20s/30% upsell. Product admin remains at `/admin`. Existing Auth.js/CRM shell has admin/agent nav, theme and optional admin-only assistant. Runtime secrets stay outside UI.

## Files to Create

- `src/app/(admin)/crm/parametres/page.tsx`
- `src/app/api/crm/settings/route.ts`
- `src/components/crm/store-settings-form.tsx`

## Files to Modify

- `src/app/(admin)/crm/layout.tsx`, `src/components/crm/{crm-nav,crm-mobile-nav}.tsx`
- Login/root metadata modules only to replace neutral hardcoded branding; do not modify order/stock pages.

## Technical Details

1. Admin-only settings page/route calls safe settings service; GET/PUT or server-action equivalent with existing CSRF/origin/role guards. Display name, shipping fee/free threshold, upsell enabled/window/discount. Validate server-side; invalid updates leave prior settings intact.
2. Explain in French that updates apply to new orders/offers. Currency remains MAD, locale French, Casablanca timezone. No warehouse renaming through settings; stable key `MAIN` independent of store name.
3. Never display/edit/return auth, Ozon, storefront API, catalog-agent or Meta keys in settings JSON. Deployment docs cover env configuration later. `storeName` safely escaped and reflected in desktop/mobile CRM heading and title; preserve noindex metadata.
4. Admin nav links to catalog `/admin`, team and settings; agents see only authorized workflows. Preserve direct route protection even if link hidden. Keep theme, logout and mobile touch targets. Avoid branding product-specific graphics or Zehri domain links.
5. Optional assistant remains admin-only and configured/not-configured behavior unchanged; task17 generalizes its data. Verify settings persistence, agent denied actions, store heading change and fresh default page. Run `npm run lint`, `npx tsc --noEmit`.

## Acceptance Criteria

- [ ] Admin can configure safe store rules; agent cannot mutate them.
- [ ] CRM/login navigation and metadata have neutral/dynamic branding.
- [ ] Catalog/settings are discoverable while role guards remain effective.
- [ ] Secrets cannot be read/written through safe settings endpoints.
