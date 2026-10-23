# Task 09: Pack and landing editor in /admin

## Status

pending

## Wave

2

## Description

The owner sets pack prices (for example "2 pièces = 349 DH") and turns on the landing page `/l/[slug]` per product from the existing admin product form. This task adds a "Packs & landing page" section to the product edit page and an admin API route that saves packs and the landing flag. After any save it calls `revalidateStorefront()`, so the storefront updates immediately. The admin UI is French, like the rest of the CRM.

## Dependencies

**Depends on:** task-03-storefront-data-cache.md, task-04-product-packs-backend.md
**Blocks:** task-14-landing-pages.md

**Context from dependencies:**
- Task 04 created migration 018:
  - `product_packs(id, product_id, quantity 2..10, price_mad, label?, highlight 0/1, active 0/1, created_at, updated_at)`, with a unique active `(product_id, quantity)`.
  - `products.landing_enabled`.
- Task 04 also created `src/lib/services/packs.ts`, with:
  - `listPacks(productId)`
  - `replacePacks(productId, packs[])`: transactional. It deactivates old packs and inserts new ones, validating quantities 2–10 (unique), at most 4 packs, integer prices, and `price < quantity × product.price`. It throws French messages.
  - `setLandingEnabled(productId, enabled)`
  - `packsInputSchema` (zod)

  It added `packs: ProductPack[]` (`{id, quantity, price, label?, highlight}`) and `landingEnabled: boolean` to `CommerceProduct`.
- Task 03 created `revalidateStorefront()` in `src/lib/storefront/revalidate.ts`.

## Files to Create

- `src/app/api/admin/products/[id]/packs/route.ts`: `PUT` saves `{ landingEnabled: boolean, packs: [{quantity, price, label?, highlight?}] }`.
- `src/components/admin/packs-editor.tsx`: a client component for editing packs and the landing toggle.

## Files to Modify

- `src/app/(admin)/admin/produits/[id]/page.tsx`: render `<PacksEditor productId basePrice initialPacks initialLandingEnabled productSlug />` below the existing product form.
- `src/components/admin/catalog-form.module.css`: add styles only if needed, reusing the existing classes.

## Technical Details

### API route

Copy the auth and guard pattern exactly from `src/app/api/admin/products/[id]/route.ts`: the admin role check, the origin check (middleware already enforces it for `/api/admin/*`, plus the handler's own checks), and the body limit.

- Validate the body with zod (`packsInputSchema` plus `landingEnabled: z.boolean()`, strict).
- In **one** immediate transaction, or with two service calls if the service functions already open their own transactions: `replacePacks(id, packs)` and `setLandingEnabled(id, landingEnabled)`. If the service functions open their own transactions, add a combined service function `savePacksAndLanding(id, input)` in `packs.ts` that does both in one transaction.
- On success: call `revalidateStorefront()`, then return `{ packs, landingEnabled }` (the fresh state).
- Validation errors return 400 with `{ error: message }`, matching the existing admin routes' error shape.
- A 404 is returned if the product doesn't exist.

### Editor UI (French)

- Title "Packs & page de vente".
- A toggle "Activer la page de vente /l/{slug}" that shows a link to `/l/{slug}` (new tab) when on.
- A pack list, with up to 4 rows. Each row has:
  - "Quantité" (number 2–10)
  - "Prix du pack (DH)" (integer)
  - "Libellé" (optional, for example "Le plus populaire")
  - "Mettre en avant" (checkbox; at most one highlighted, so the UI unchecks the others)
  - A delete button
- An "Ajouter un pack" button, plus a live hint per row: "Prix normal : {q × base} DH · Économie : {q × base − price} DH". Show it in red when the pack price is ≥ the normal price.
- "Enregistrer" calls `PUT`, shows a sonner toast ("Packs enregistrés" or the error message), and disables while pending.
- Use the existing shadcn `Button`, `Input`, `Label`, `Checkbox` and `Card` from `src/components/ui`, following the style of `variant-editor.tsx` and `product-form.tsx`.
- Must be usable on mobile (the CRM is mobile-friendly). Rows stack vertically under 640 px.

## Acceptance Criteria

- [ ] An admin can add a 2-pack at 349 and a 3-pack at 449 for a 199 DH product, save, reload, and see them persisted.
- [ ] Invalid input (duplicate quantity, price ≥ normal, more than 4 packs) is rejected with a French message, and nothing is saved.
- [ ] An agent (non-admin) receives 403 from the API, matching the other admin product routes.
- [ ] After saving, `GET /api/storefront/v1/catalog/{slug}` (or the cached loader) reflects the new packs immediately.
- [ ] The landing toggle persists, and the link appears when enabled.
- [ ] Lint, typecheck and `npm test` pass.
