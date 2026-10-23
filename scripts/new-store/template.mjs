// Renders store.config.ts source from fully resolved wizard answers.

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function render(value, indent) {
  const pad = "  ".repeat(indent);
  const inner = "  ".repeat(indent + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => render(v, indent + 1));
    const oneLine = `[${items.join(", ")}]`;
    if (items.every((i) => !i.includes("\n")) && oneLine.length <= 80 - indent * 2) return oneLine;
    return `[\n${items.map((i) => `${inner}${i},`).join("\n")}\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    const lines = entries.map(([k, v]) => `${inner}${IDENT.test(k) ? k : JSON.stringify(k)}: ${render(v, indent + 1)},`);
    return `{\n${lines.join("\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}

/**
 * @param {object} a resolved answers: slug, name, domain, locale, city, brand, contact,
 *   categories, tracking, heroImage, copy (see scripts/new-store.mjs)
 */
export function renderConfig(a) {
  const c = a.copy;
  const config = {
    slug: a.slug,
    name: a.name,
    domain: a.domain,
    locale: a.locale,
    brand: a.brand,
    contact: {
      whatsapp: a.contact.whatsapp,
      phone: a.contact.phone,
      email: a.contact.email || undefined,
      city: a.city,
    },
    seo: { title: c.seoTitle, description: c.seoDescription },
    announcement: c.announcement,
    nav: { categories: a.categories },
    home: {
      sections: ["hero", "categories", "bestSellers", "guarantees", "testimonials", "faq", "cta"],
      hero: { ...c.hero, image: a.heroImage, ctaHref: "/boutique" },
      guarantees: c.guarantees,
      testimonials: c.testimonials,
      faq: c.faq,
      cta: { ...c.cta, href: "/boutique" },
    },
    product: { trustBadges: c.trustBadges, reviews: [], sizeGuides: {} },
    landing: { stickyCta: true, index: false },
    legal: c.legal,
    tracking: {
      metaPixelId: a.tracking.metaPixelId || undefined,
      tiktokPixelId: a.tracking.tiktokPixelId || undefined,
    },
    customSections: {},
  };
  return `import type { StoreConfigInput } from "@/config/schema";\n\nexport default ${render(config, 0)} satisfies StoreConfigInput;\n`;
}
