# Task 02: store.config.ts schema, loader and fr/ar UI strings

## Status

complete

## Wave

1

## Description

Each niche needs a different name, logo, colours, fonts, copy, nav, FAQ, reviews, pixel IDs and locale. In zehri the store name is hard-coded 111 times across 47 files, and in hellobaby copy is spread over about 20 components. This task creates **one typed, validated config file** at the repo root (`store.config.ts`), a loader in `src/config/index.ts`, and a fixed UI string dictionary for `fr` and `ar` in `src/config/i18n.ts`. All storefront tasks read only from these. An invalid config must fail at import time, which fails `next build`, so a half-configured store can never ship.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-06-app-shell-and-build.md, task-07-browser-tracking.md, task-10-new-store-cli.md (and indirectly every storefront UI task)

**Context from dependencies:** None.

## Files to Create

- `src/config/schema.ts`: the zod schema and exported `StoreConfig` type.
- `src/config/index.ts`: imports `../../store.config`, parses it, and exports `storeConfig` (frozen) plus small helpers.
- `src/config/i18n.ts`: `UI_STRINGS` for fr/ar and `t(key)`.
- `store.config.ts`: a neutral, complete **example** config (French, placeholder brand "Ma Boutique") that builds and renders.
- `public/brand/README.md`: explains that the wizard writes `logo.webp` and `icon.png` here.

## Files to Modify

- `src/lib/services/store-settings.ts`: when no settings row exists, default `storeName` to `storeConfig.name` instead of `"COD CRM"`. Keep `DEFAULT_STORE_SETTINGS` unchanged for the other fields and for tests.

## Technical Details

### Schema (src/config/schema.ts)

Use `z` from `@/lib/validation` (the project's zod re-export, zod 3). Strings must be non-empty unless optional. Colours are hex `#RRGGBB`.

```ts
import { z } from "@/lib/validation";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const text = z.string().trim().min(1);
const sectionId = z.enum(["hero", "categories", "bestSellers", "guarantees", "testimonials", "faq", "cta"]);

export const storeConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),          // used for storage keys and order prefixes
  name: text.max(60),
  domain: z.string().url(),                              // https://example.ma, used for canonical/sitemap
  locale: z.enum(["fr", "ar"]),
  brand: z.object({
    logo: z.string().startsWith("/"),                    // e.g. /brand/logo.webp
    logoWidth: z.number().int().positive(),
    logoHeight: z.number().int().positive(),
    icon: z.string().startsWith("/").optional(),
    colors: z.object({
      primary: hex, primaryForeground: hex, accent: hex,
      background: hex, foreground: hex, muted: hex, border: hex,
    }),
    fonts: z.object({
      heading: z.enum(["playfair", "inter", "cairo"]),
      body: z.enum(["inter", "cairo"]),
    }),
    radius: z.enum(["none", "sm", "md", "lg", "full"]).default("md"),
  }),
  contact: z.object({
    whatsapp: z.string().regex(/^212[67]\d{8}$/),        // wa.me format, no +
    phone: text, email: z.string().email().optional(), city: text, hours: text.optional(),
  }),
  seo: z.object({ title: text, description: text.max(160), ogImage: z.string().startsWith("/").optional() }),
  announcement: z.array(text).max(5).default([]),
  nav: z.object({
    categories: z.array(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), label: text, image: z.string().optional() })).max(12),
  }),
  home: z.object({
    sections: z.array(sectionId).min(1),
    hero: z.object({ title: text, subtitle: text, image: z.string().startsWith("/"), ctaLabel: text, ctaHref: z.string().startsWith("/") }),
    guarantees: z.array(z.object({ icon: z.enum(["truck", "cash", "refresh", "shield", "phone", "star"]), title: text, text })).max(4).default([]),
    testimonials: z.array(z.object({ name: text, city: text.optional(), text, rating: z.number().int().min(1).max(5) })).default([]),
    faq: z.array(z.object({ q: text, a: text })).default([]),
    cta: z.object({ title: text, text, label: text, href: z.string().startsWith("/") }).optional(),
  }),
  product: z.object({
    trustBadges: z.array(text).max(4).default([]),
    reviews: z.array(z.object({ name: text, text, rating: z.number().int().min(1).max(5), productSlug: z.string().optional() })).default([]),
    sizeGuides: z.record(z.string(), z.object({ title: text, headers: z.array(text), rows: z.array(z.array(z.string())) })).default({}),
  }),
  landing: z.object({ stickyCta: z.boolean().default(true), index: z.boolean().default(false) }).default({}),
  legal: z.object({ about: text, shipping: text, terms: text, privacy: text }),   // plain text / simple markdown paragraphs
  tracking: z.object({
    metaPixelId: z.string().regex(/^\d{5,20}$/).optional(),
    tiktokPixelId: z.string().regex(/^[A-Z0-9]{10,30}$/).optional(),
  }).default({}),
  customSections: z.record(z.string(), z.array(z.string())).default({}),   // productSlug -> section component keys
}).strict();

export type StoreConfigInput = z.input<typeof storeConfigSchema>;
export type StoreConfig = z.output<typeof storeConfigSchema>;
```

### Loader (src/config/index.ts)

```ts
import raw from "../../store.config";
import { storeConfigSchema, type StoreConfig } from "./schema";

const parsed = storeConfigSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error("store.config.ts invalide:\n" + parsed.error.issues.map(i => `- ${i.path.join(".")}: ${i.message}`).join("\n"));
}
export const storeConfig: Readonly<StoreConfig> = Object.freeze(parsed.data);
export const isRtl = storeConfig.locale === "ar";
export const htmlDir = isRtl ? "rtl" : "ltr";
export const whatsappLink = (message?: string) =>
  `https://wa.me/${storeConfig.contact.whatsapp}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
```

`store.config.ts` must `export default { … } satisfies StoreConfigInput` with `import type { StoreConfigInput } from "@/config/schema"`. Check that the `@/` alias resolves from the repo root in `tsconfig.json` (`"@/*": ["./src/*"]`). If importing `../../store.config` from `src/config` hits a `tsconfig` `include` issue, add `"store.config.ts"` to `include`. Do not move the file under `src/`: the root location makes it obvious to the owner.

**Client bundle note:** zod must not end up in client bundles (bundle budget). Client components must **not** import `@/config` directly. Server components read `storeConfig` and pass the plain values down as props. To make this hard to get wrong, add `import "server-only";` at the top of `src/config/index.ts` (install with `npm i server-only` if it is missing). `src/config/i18n.ts` must **not** import zod or the schema. It is a plain object so client components can import it, and its locale argument is passed in from server props.

### UI strings (src/config/i18n.ts)

Plain TS, no imports. It must cover at least these keys (the French values are the zehri wording):

```ts
export type Locale = "fr" | "ar";
export const UI_STRINGS = {
  fr: {
    addToCart: "Ajouter au panier", orderNow: "Commander maintenant", soldOut: "Épuisé",
    cart: "Panier", cartEmpty: "Votre panier est vide", subtotal: "Sous-total", shipping: "Livraison",
    freeShipping: "Livraison gratuite", total: "Total", checkout: "Commander",
    freeShippingProgress: "Plus que {amount} pour la livraison gratuite",
    fullName: "Nom complet", phone: "Téléphone", phonePlaceholder: "06 XX XX XX XX",
    phoneInvalid: "Numéro marocain invalide", nameRequired: "Votre nom est requis",
    cod: "Paiement à la livraison", confirmOrder: "Confirmer la commande", sending: "Envoi…",
    upsellTitle: "Offre spéciale pour vous", upsellAccept: "Oui, ajouter", upsellDecline: "Non merci",
    upsellEndsIn: "Se termine dans {s}s", thankYouTitle: "Merci pour votre commande !",
    thankYouText: "Notre équipe vous appelle pour confirmer votre commande.",
    orderNumber: "N° de commande", contactWhatsapp: "Nous contacter sur WhatsApp",
    chooseOption: "Choisir {name}", quantity: "Quantité", packs: "Choisissez votre offre",
    pieces: "{n} pièce(s)", save: "Économisez {amount}", bestValue: "Meilleure offre",
    differentOptions: "Choisir des options différentes", unit: "Article {n}",
    home: "Accueil", shop: "Boutique", about: "À propos", contact: "Contact",
    shippingReturns: "Livraison & retours", terms: "CGV", privacy: "Confidentialité",
    faq: "Questions fréquentes", reviews: "Avis clients", bestSellers: "Meilleures ventes",
    youMayLike: "Vous aimerez aussi", genericError: "Une erreur est survenue, réessayez.",
    retryLater: "Trop de tentatives, réessayez dans un instant.",
  },
  ar: { /* same keys, Moroccan-friendly Modern Standard Arabic, e.g. addToCart: "أضف إلى السلة",
          orderNow: "اطلب الآن", soldOut: "نفدت الكمية", cod: "الدفع عند الاستلام",
          confirmOrder: "تأكيد الطلب", fullName: "الاسم الكامل", phone: "رقم الهاتف", ... */ },
} as const satisfies Record<Locale, Record<string, string>>;

export type UiKey = keyof typeof UI_STRINGS.fr;
export function t(locale: Locale, key: UiKey, vars?: Record<string, string | number>): string {
  let s: string = UI_STRINGS[locale][key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
```

Fill **every** key in `ar`. TypeScript must enforce that `ar` has the same keys as `fr`, for example with `satisfies Record<Locale, Record<keyof typeof fr, string>>` and `fr` declared first. Prices are always formatted `"{n} DH"` (fr) or `"{n} درهم"` (ar). Export `formatPrice(locale, n)` from i18n.ts.

### Example store.config.ts

Write a complete, valid example with these values:
- `slug: "ma-boutique"`, `name: "Ma Boutique"`, `domain: "http://localhost:3000"`, `locale: "fr"`.
- Neutral colours (primary `#1f2937`, accent `#d97706`, background `#ffffff`, foreground `#111827`, muted `#f3f4f6`, border `#e5e7eb`, primaryForeground `#ffffff`).
- Fonts: heading playfair, body inter. Logo `/brand/logo.webp`, 120×40.
- 3 guarantees (livraison partout au Maroc, paiement à la livraison, échange facile), 3 testimonials, 4 FAQ items, 2 announcements, a hero, `sections: ["hero","categories","bestSellers","guarantees","testimonials","faq","cta"]`.
- `nav.categories` with one entry `{slug:"nouveautes",label:"Nouveautés"}`.
- Short French legal texts.

Also add a placeholder `public/brand/logo.webp`: generate a simple 240×80 WebP containing the text "Ma Boutique" with sharp in a one-off node command, or commit any small neutral WebP. Make sure `/brand/logo.webp` exists.

### store-settings change

In `getStoreSettings()`, when `getAppState(...)` returns `null`, return `{ ...DEFAULT_STORE_SETTINGS, storeName: storeConfig.name }`. Importing `@/config` (server-only) from a service is fine. If any `scripts/*.test.mjs` asserts the default `"COD CRM"`, check it. Those tests load source through `scripts/test-source.mjs`; read it to see whether `@/config` will resolve. If resolving `store.config.ts` from tests is problematic, read `process.env.STORE_NAME_DEFAULT ?? storeConfig.name` lazily inside the function and keep the tests green. Do not weaken any test.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `npm run lint` pass.
- [ ] Deleting a required field from `store.config.ts` (for example `contact.city`) makes `next build` fail with a message naming `contact.city`. Restore it afterwards.
- [ ] `UI_STRINGS.ar` has every key of `UI_STRINGS.fr`, enforced by the type checker.
- [ ] `src/config/index.ts` starts with `import "server-only"`. `src/config/i18n.ts` has no imports.
- [ ] A fresh DB shows the config name in CRM metadata. `npm test` still passes.

## Notes

Do not wire the config into any layout or page here. Task 06 (root layout) and tasks 11–14 (storefront UI) do that.
