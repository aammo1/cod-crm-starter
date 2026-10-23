# Task 06: Root/admin layout split, theme tokens, next.config, Dockerfile

## Status

complete

## Wave

2

## Description

Right now `src/app/layout.tsx` exports `dynamic = "force-dynamic"` and reads store settings from SQLite in `generateMetadata`. Because every route inherits the root layout, **nothing can ever be static or ISR**. This task:
- Makes the root layout minimal and static: no DB, `lang`/`dir`/fonts/theme from `store.config.ts`.
- Moves the dynamic CRM metadata and `force-dynamic` into a new `src/app/(admin)/layout.tsx`.
- Removes the root redirect page, because `/` becomes the storefront home in task 13.
- Applies the build and asset fixes that made zehri slow: `inlineCss` removed, AVIF enabled, a long image cache TTL, and the image cache persisted on the data volume.

## Dependencies

**Depends on:** task-02-store-config.md
**Blocks:** task-11-funnel.md (and indirectly all storefront UI)

**Context from dependencies:** Task 02 created:
- `store.config.ts` at the repo root (validated at import).
- `src/config/index.ts`, which exports `storeConfig` (server-only, frozen), `isRtl` and `htmlDir`.
- `src/config/i18n.ts`, with the `UI_STRINGS`/`t()` fr/ar dictionaries.

`storeConfig.brand.colors` has `primary, primaryForeground, accent, background, foreground, muted, border` as `#RRGGBB`. `storeConfig.brand.fonts` is `{ heading: "playfair"|"inter"|"cairo", body: "inter"|"cairo" }`, and `storeConfig.brand.radius` is one of `none|sm|md|lg|full`. `storeConfig.locale` is `"fr"|"ar"`, and `storeConfig.seo` is `{ title, description, ogImage? }`.

## Files to Create

- `src/app/(admin)/layout.tsx`: `export const dynamic = "force-dynamic"`, plus the existing CRM `generateMetadata` (moved from the root). It forces `lang="fr" dir="ltr"` on a wrapper.
- `src/app/fonts/cairo-arabic-var.woff2`: Arabic variable font (see below).

## Files to Modify

- `src/app/layout.tsx`: static root layout.
- `src/app/page.tsx`: **delete**. The storefront home arrives in task 13. Until then `/` returns 404; that is expected.
- `src/app/globals.css`: storefront theme tokens via CSS variables, plus logical-property helpers.
- `next.config.ts`: remove `experimental.inlineCss`, add the `images` config, keep the headers and output tracing.
- `Dockerfile`: persist the Next image-optimizer cache on `/app/data`.

## Technical Details

### Root layout (src/app/layout.tsx)

- **No** `export const dynamic`. No imports from `@/lib/db`, `@/lib/services/*` or `@/auth*`.
- Fonts with `next/font/local`, keeping the existing Inter and Playfair files in `src/app/fonts/`, plus Cairo for Arabic:
  - `inter`: `preload` true only if `brand.fonts.body === "inter"`.
  - `playfair`: as now (`preload: false`).
  - `cairo`: `src: "./fonts/cairo-arabic-var.woff2"`, weight `"200 1000"`, variable `--font-cairo`, `preload` true only when `storeConfig.locale === "ar"`.
  - `next/font` options must be static literals. Declare all three fonts unconditionally and pick the `preload` booleans from config at module scope. If `next/font` rejects non-literal `preload`, declare two Inter variants (one preloaded, one not) and choose between them by config. Use the simplest form that compiles.
- `<html lang={storeConfig.locale} dir={htmlDir} suppressHydrationWarning>`.
- `<body>` gets the font variable classes, plus `data-heading-font` and `data-body-font` attributes taken from config.
- Inject theme variables with a server-rendered `<style>` in `<head>`:
  ```tsx
  const c = storeConfig.brand.colors;
  const radius = { none: "0px", sm: "0.25rem", md: "0.5rem", lg: "0.875rem", full: "9999px" }[storeConfig.brand.radius];
  <style>{`:root{--store-primary:${c.primary};--store-primary-fg:${c.primaryForeground};--store-accent:${c.accent};--store-bg:${c.background};--store-fg:${c.foreground};--store-muted:${c.muted};--store-border:${c.border};--store-radius:${radius}}`}</style>
  ```
  The values are validated hex strings, so this is safe.
- Metadata: a static `export const metadata` built from `storeConfig`:
  - `title: { default: storeConfig.seo.title, template: \`%s | ${storeConfig.name}\` }`.
  - `description`.
  - `metadataBase: new URL(storeConfig.domain)`.
  - `openGraph` with `ogImage` when set.
  - `icons` from `brand.icon` when set.
  - **Indexable** (no `robots` noindex at the root; the admin layout sets noindex).
- Keep `<Toaster richColors position="top-center" />`.

### Admin layout (src/app/(admin)/layout.tsx)

```tsx
import type { Metadata } from "next";
import { getStoreSettings } from "@/lib/services/store-settings";
export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  const { storeName } = getStoreSettings();
  return { title: { default: `${storeName} — Gestion des commandes`, template: `%s | ${storeName}` },
           description: "Gestion des commandes, du stock et des livraisons au Maroc.",
           robots: { index: false, follow: false } };
}
export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return <div lang="fr" dir="ltr" className="font-sans">{children}</div>;
}
```

Check that the existing `src/app/(admin)/admin/layout.tsx` and `src/app/(admin)/crm/layout.tsx` still work nested under this layout. The CRM theme (`crm-theme.css`, next-themes) must be unaffected. The CRM must stay LTR and French even when `locale = "ar"`.

### Root page

Delete `src/app/page.tsx` (the redirect to `/crm` or `/login`). After login, the login flow already redirects to its `callbackUrl` or `/crm`; check this in `src/app/(admin)/login/*`. Add a "Gestion" or "CRM" link only in the CRM, not on the storefront.

Check `scripts/*.test.mjs` and `scripts/e2e-crm.mjs` for anything that expects `/` to redirect. If a test asserts this, change it to hit `/login` or `/crm` directly, and mention the change in your summary.

### globals.css

Add a Tailwind v4 theme mapping for storefront tokens, without changing existing CRM tokens:

```css
@theme inline {
  --color-store-primary: var(--store-primary);
  --color-store-primary-fg: var(--store-primary-fg);
  --color-store-accent: var(--store-accent);
  --color-store-bg: var(--store-bg);
  --color-store-fg: var(--store-fg);
  --color-store-muted: var(--store-muted);
  --color-store-border: var(--store-border);
  --radius-store: var(--store-radius);
  --font-heading: var(--font-playfair);
}
body[data-heading-font="inter"] { --font-heading: var(--font-inter); }
body[data-heading-font="cairo"], html[lang="ar"] body { --font-heading: var(--font-cairo); }
html[lang="ar"] body { font-family: var(--font-cairo), system-ui, sans-serif; }
```

Storefront components (tasks 11–14) use `bg-store-primary`, `text-store-fg`, `rounded-store`, `font-heading`, and so on. They also use **logical** utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`) so that RTL works without separate CSS.

### Cairo font file

Get the Cairo variable woff2 for the Arabic and Latin subsets:
1. `npm i -D @fontsource-variable/cairo`.
2. Copy the arabic-subset woff2 (`node_modules/@fontsource-variable/cairo/files/cairo-arabic-wght-normal.woff2`; check the exact filename) to `src/app/fonts/cairo-arabic-var.woff2`.
3. Then uninstall the package so it does not stay in deps.

The font is licensed OFL; add a line to `src/app/fonts/LICENSES.md` (create it if missing).

### next.config.ts

```ts
const nextConfig: NextConfig = {
  output: "standalone",
  // inlineCss removed: storefront pages are cached (ISR + Cloudflare), so a shared, cacheable
  // stylesheet beats re-sending ~21 KB of CSS inside every HTML/RSC response.
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 365,   // uploads are content-addressed / immutable
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1600],
    imageSizes: [64, 96, 128, 256, 384],
    localPatterns: [{ pathname: "/api/media/**" }, { pathname: "/images/**" }, { pathname: "/brand/**" }],
  },
  outputFileTracingIncludes: { /* unchanged */ },
  poweredByHeader: false,
  async headers() { /* unchanged security headers */ },
};
```

Confirm that uploaded media URLs are served under `/api/media/...`, and check whether upload filenames are unique per upload, for example by reading `src/lib/uploads.ts`. If filenames can be overwritten in place, use `minimumCacheTTL: 60 * 60 * 24 * 7` instead and leave a comment explaining why.

Also add a `Cache-Control` header rule for `/brand/:path*` and `/images/:path*`: `public, max-age=31536000, immutable`. Also add a comment in the config: "the new-store wizard writes versioned filenames".

### Dockerfile

In the runner stage, replace the line `RUN mkdir -p /app/data/uploads /app/.next/cache …` with:

```dockerfile
RUN mkdir -p /app/data/uploads /app/data/image-cache /app/.next/cache \
    && ln -s /app/data/image-cache /app/.next/cache/images \
    && chown -R nextjs:nodejs /app/data /app/.next/cache
```

This way optimized images survive redeploys. The volume is mounted at `/app/data`, and the symlink target exists once the volume is mounted, because the directory is created on first write. To be robust, also create it at startup: if `CMD` is plain `node server.js`, wrap it as `CMD ["sh", "-c", "mkdir -p /app/data/image-cache && exec node server.js"]`. Keep the existing healthcheck and the build-time no-DB assertion untouched.

## Acceptance Criteria

- [ ] `grep -n "force-dynamic" src/app/layout.tsx` returns nothing. The root layout imports no DB, service or auth module.
- [ ] `DELIVERY_PROVIDER=mock DB_PATH=/tmp/crm-build-must-not-exist/crm.db npm run build` succeeds, and the DB path does not exist afterwards.
- [ ] In the build output, `/login`, `/crm/*` and `/admin/*` are dynamic (ƒ). The CRM and login still work in `npm run start`.
- [ ] With `locale: "ar"` in `store.config.ts`, the root HTML has `lang="ar" dir="rtl"` and the `(admin)` wrapper has `dir="ltr"`. Revert to `fr` afterwards.
- [ ] `next.config.ts` has no `inlineCss`. AVIF and WebP are enabled.
- [ ] `docker build` succeeds. In the container, `/app/.next/cache/images` is a symlink into `/app/data/image-cache`. (If Docker isn't available, state that this criterion was not verified.)
- [ ] `npm run lint`, `npx tsc --noEmit` and `npm test` pass.
