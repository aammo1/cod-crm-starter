import { z } from "@/lib/validation";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const text = z.string().trim().min(1);
const sectionId = z.enum(["hero", "categories", "bestSellers", "guarantees", "testimonials", "faq", "cta"]);

export const storeConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/), // used for storage keys and order prefixes
  name: text.max(60),
  domain: z.string().url(), // https://example.ma, used for canonical/sitemap
  locale: z.enum(["fr", "ar"]),
  brand: z.object({
    logo: z.string().startsWith("/"), // e.g. /brand/logo.webp
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
    whatsapp: z.string().regex(/^212[67]\d{8}$/), // wa.me format, no +
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
  legal: z.object({ about: text, shipping: text, terms: text, privacy: text }), // plain text / simple markdown paragraphs
  tracking: z.object({
    metaPixelId: z.string().regex(/^\d{5,20}$/).optional(),
    tiktokPixelId: z.string().regex(/^[A-Z0-9]{10,30}$/).optional(),
  }).default({}),
  customSections: z.record(z.string(), z.array(z.string())).default({}), // productSlug -> section component keys
}).strict();

export type StoreConfigInput = z.input<typeof storeConfigSchema>;
export type StoreConfig = z.output<typeof storeConfigSchema>;
