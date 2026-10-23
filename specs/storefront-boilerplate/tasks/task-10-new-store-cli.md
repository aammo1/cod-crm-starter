# Task 10: `npm run new-store` wizard

## Status

complete

## Wave

2

## Description

Launching a new niche should take about half a day. After creating a repo from the GitHub template, the owner runs `npm run new-store`. The wizard asks about 20 questions and then writes:
- `store.config.ts`
- `.env.local` (dev) and `.env.production.example` (values to paste into Coolify)
- A processed logo (WebP) and icon in `public/brand/`

It also creates the first admin user. It has a non-interactive mode (`--answers answers.json`), so it can be scripted or driven by a Claude skill later.

## Dependencies

**Depends on:** task-02-store-config.md
**Blocks:** task-15-docs-and-perf-budget.md

**Context from dependencies:** Task 02 created `src/config/schema.ts` (zod `storeConfigSchema`, `StoreConfigInput`) and a complete example `store.config.ts` at the repo root that exports `default { … } satisfies StoreConfigInput`. Required fields:
- `slug` (`/^[a-z0-9-]{2,40}$/`), `name` (≤60), `domain` (URL), `locale` (`"fr"|"ar"`)
- `brand.{logo, logoWidth, logoHeight, icon?, colors{primary, primaryForeground, accent, background, foreground, muted, border}(#RRGGBB), fonts{heading: playfair|inter|cairo, body: inter|cairo}, radius}`
- `contact.{whatsapp (/^212[67]\d{8}$/), phone, email?, city, hours?}`
- `seo.{title, description≤160, ogImage?}`
- `announcement[]`, `nav.categories[{slug,label,image?}]`
- `home.{sections[], hero{title,subtitle,image,ctaLabel,ctaHref}, guarantees[], testimonials[], faq[], cta?}`
- `product.{trustBadges[], reviews[], sizeGuides{}}`, `landing.{stickyCta,index}`
- `legal.{about,shipping,terms,privacy}`, `tracking.{metaPixelId?, tiktokPixelId?}`, `customSections{}`

The existing `scripts/create-user.mjs <email> <password> <name> <admin|agent>` creates users. Env vars are listed in `.env.example`: `DB_PATH, AUTH_SECRET, CRM_PUBLIC_URL, STOREFRONT_API_KEY, SECURITY_ALLOWED_ORIGINS, SECURITY_TRUSTED_IP_HEADER, CATALOG_AGENT_KEY, OZON_CLIENT_ID, OZON_API_KEY, OZON_BASE_URL, …, DELIVERY_PROVIDER, FACEBOOK_PIXEL_ID, FACEBOOK_ACCESS_TOKEN, …, OPENROUTER_*`. TikTok variables are added by task 05: `TIKTOK_PIXEL_ID, TIKTOK_ACCESS_TOKEN, TIKTOK_TEST_EVENT_CODE, TIKTOK_API_BASE`.

## Files to Create

- `scripts/new-store.mjs`: the wizard (plain Node ESM, no TS build step).
- `scripts/new-store/template.mjs`: a function `renderConfig(answers)` that returns the `store.config.ts` source text.
- `scripts/new-store/copy-presets.mjs`: default French and Arabic copy (hero, guarantees, FAQ, legal, announcements) parameterised by store name, city and niche.
- `examples/new-store-answers.json`: a complete example answers file.

## Files to Modify

- `package.json`: add `"new-store": "node scripts/new-store.mjs"`.

## Technical Details

### Flow

Use `node:readline/promises` and show defaults in brackets.

1. Refuse to run if `store.config.ts` has already been customised: it no longer contains the marker comment `// new-store:template`. Allow it with `--force`. Add that marker as the first line of the example config in this task. (Task 02 created the file, and editing one comment line is fine.)
2. Ask, in French:
   - **Identity:**
     - Nom de la boutique
     - Slug (default slugified from the name)
     - Domaine (`https://…`)
     - Langue (fr/ar, default fr)
     - Niche (free text, used only to pick copy wording)
     - Ville
   - **Contact:**
     - WhatsApp (accept `06…`, `+2126…` or `2126…`, normalised to `2126XXXXXXXX`; re-ask if invalid)
     - Téléphone affiché
     - Email (optional)
   - **Brand:**
     - Chemin du logo (PNG/JPG/SVG/WebP)
     - Couleur principale (hex)
     - Couleur d'accent (hex)
     - Style (1 = élégant: playfair/inter, 2 = moderne: inter/inter, 3 = arabe: cairo/cairo; default 3 if ar)
     - Arrondis (none/sm/md/lg/full)
   - **Categories:** a comma-separated list of labels. Slugs are derived from the labels.
   - **Tracking** (all optional): Meta Pixel ID, Meta access token, TikTok pixel code, TikTok access token.
   - **Ozon** (optional now): Client ID, API key.
   - **Admin:** email, name, password (hidden input, 12–128 characters, confirmed twice).
3. Derive the remaining colours:
   - `primaryForeground`: `#ffffff` or `#111111`, whichever has the higher WCAG contrast against primary.
   - `background`: `#ffffff`.
   - `foreground`: `#111827`.
   - `muted`: primary mixed at 6% into white.
   - `border`: primary mixed at 14% into white.
4. **Logo:**
   - Use `sharp` (already a dependency).
   - Trim transparent edges, resize to height 96 px (2× for a 48 px display), and output `public/brand/logo-<hash8>.webp` (quality 90). Use versioned filenames, because brand assets are served with immutable caching.
   - Generate `public/brand/icon-<hash8>.png` at 512×512, contained on the background colour.
   - Set `brand.logo`, `logoWidth`, `logoHeight` (the display size at height 48) and `brand.icon`.
   - Delete the old `logo-*.webp` and `icon-*.png` files the wizard created earlier (only files matching that pattern).
5. **Hero image:** if the owner doesn't give a path, set `/brand/hero-placeholder.webp`. Generate a 1600×900 WebP gradient from primary to accent with sharp.
6. **Copy:** fill `home`, `legal`, `announcement` and `product.trustBadges` from `copy-presets.mjs` in the chosen locale, with name and city interpolated. The owner edits them later. Arabic presets use the Moroccan-friendly MSA wording: "التوصيل لجميع مدن المغرب", "الدفع عند الاستلام", and so on.
7. **Write `store.config.ts`** via `renderConfig(answers)`. The output is formatted TypeScript with `import type { StoreConfigInput } from "@/config/schema";` and `export default { … } satisfies StoreConfigInput;`. Drop the `// new-store:template` marker.
8. **Validate:** run `npx tsc --noEmit -p .` and stop with the errors if it fails. Alternatively, import the schema via a tiny `tsx`-free approach: spawn `node --experimental-strip-types` if it is available on Node 22.6+. Otherwise rely on tsc.
9. **Write `.env.local`** (only if it is missing, or with `--force`):
   - `DB_PATH=./data/crm.db`
   - `AUTH_SECRET`, `STOREFRONT_API_KEY` and `CATALOG_AGENT_KEY` = `crypto.randomBytes(32).toString("base64url")` each
   - `CRM_PUBLIC_URL=http://localhost:3000`
   - `SECURITY_ALLOWED_ORIGINS=http://localhost:3000`
   - `DELIVERY_PROVIDER=mock`
   - Pixel and token variables from the answers (`FACEBOOK_PIXEL_ID` = the Meta pixel ID and `TIKTOK_PIXEL_ID` = the TikTok code, the same values as `store.config.ts` `tracking`)
   - The Ozon variables
9b. **Write `.env.production.example`** with the same keys, but with:
   - `CRM_PUBLIC_URL` and `SECURITY_ALLOWED_ORIGINS` set to the domain
   - `DELIVERY_PROVIDER=ozon`
   - `DB_PATH=/app/data/crm.db` and `UPLOAD_DIR=/app/data/uploads`
   - **Freshly generated** secrets (not the dev ones)
   - A header comment: "Coller dans Coolify → Environment Variables. Ne pas committer."

   Make sure `.gitignore` already ignores `.env*` except `.env.example`, and add the rule if it doesn't.
10. **Admin user:** run `node scripts/create-user.mjs <email> <password> <name> admin` with `DB_PATH` from `.env.local`, using `child_process.spawnSync` with an args array (never a shell string), so the password is never interpolated into a shell.
11. **Print a French next-steps checklist:**
    1. `npm run dev`
    2. Add products at `/admin`
    3. Enable packs and the landing page
    4. Create the Coolify app with a volume at `/app/data` and paste `.env.production.example`
    5. Set up Cloudflare (see `docs/new-niche.md`)

### Non-interactive mode

`node scripts/new-store.mjs --answers examples/new-store-answers.json [--force] [--skip-user]` reads all answers from JSON (the same keys as the interactive prompts) and validates them with the same functions. `--skip-user` skips step 10 (useful in CI).

## Acceptance Criteria

- [ ] `node scripts/new-store.mjs --answers examples/new-store-answers.json --force --skip-user` on a clean checkout:
  - Writes a `store.config.ts` that passes `npx tsc --noEmit`.
  - Writes `public/brand/logo-*.webp` with a height of 96 px.
  - Writes `.env.local` with 3 distinct random secrets.
  - `npm run build` succeeds with the result (using `DELIVERY_PROVIDER=mock` and a non-existent `DB_PATH`).
- [ ] Running it again without `--force` refuses, with a clear French message.
- [ ] An invalid WhatsApp number or hex colour in the answers file fails with a message naming the field.
- [ ] The interactive mode creates the admin user, and that user can log in at `/login`.
- [ ] No secret is printed to the terminal, except a single "Secrets générés ✓" line.
- [ ] Lint passes (if ESLint covers `scripts/`) and typecheck passes.

## Notes

Restore the original example `store.config.ts` (with its marker) after testing, so the template stays neutral. Do not commit generated logos or env files.
