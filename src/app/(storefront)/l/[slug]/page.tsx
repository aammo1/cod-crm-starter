import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { storeConfig } from "@/config";
import { landingLabels, t } from "@/config/i18n";
import { getProduct, getShopSettings } from "@/lib/storefront/data";
import { customSections } from "@/custom";
import { Guarantees } from "@/components/storefront/home/guarantees";
import { InlineOrderForm } from "@/components/storefront/landing/inline-order-form";
import { LandingFaq } from "@/components/storefront/landing/landing-faq";
import { LandingHero } from "@/components/storefront/landing/landing-hero";
import { StickyCta } from "@/components/storefront/landing/sticky-cta";
import { ProductJsonLd } from "@/components/storefront/product/product-json-ld";
import { Reviews } from "@/components/storefront/product/reviews";
import { TrustBadges } from "@/components/storefront/product/trust-badges";

export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() { return []; }

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product || !product.active || !product.landingEnabled) return {};
  const description = product.description.slice(0, 160) || storeConfig.seo.description;
  return {
    title: `${product.name}`,
    description,
    robots: { index: storeConfig.landing.index },
    openGraph: { title: product.name, description, ...(product.images[0] ? { images: [product.images[0]] } : {}) },
  };
}

export default async function LandingPage({ params }: Params) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product || !product.active || !product.landingEnabled) notFound();
  const settings = await getShopSettings();
  const { locale } = storeConfig;
  const defaultVariant = product.variants.find((v) => v.available) ?? product.variants[0];
  const sections = (storeConfig.customSections[product.slug] ?? []).flatMap((key) => {
    const Section = customSections[key];
    if (!Section) {
      if (process.env.NODE_ENV !== "production") console.warn(`[custom] Section inconnue "${key}" pour ${product.slug}`);
      return [];
    }
    return [{ key, Section }];
  });
  const labels = landingLabels(locale);

  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 lg:pb-12">
      <ProductJsonLd product={product} />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-10">
        <LandingHero product={product} initialImages={defaultVariant?.images} />
        <div className="space-y-4 lg:sticky lg:top-4">
          <InlineOrderForm
            labels={labels}
            storeSlug={storeConfig.slug}
            shippingFeeMad={settings.shippingFeeMad}
            freeShippingThresholdMad={settings.freeShippingThresholdMad}
            product={{
              id: product.id, name: product.name, price: product.price,
              optionDefinitions: product.optionDefinitions, variants: product.variants, packs: product.packs,
            }}
          />
          <TrustBadges />
        </div>
      </div>

      <div className="mt-10 space-y-8">
        <div className="-mx-4"><Guarantees /></div>
        {sections.map(({ key, Section }) => <Section key={key} product={product} locale={locale} />)}
        {(product.story || product.description) && (
          <section className="max-w-3xl space-y-3">
            <h2 className="font-heading text-xl font-semibold">{t(locale, "productDescription")}</h2>
            {product.story && <p className="whitespace-pre-line leading-relaxed">{product.story}</p>}
            {product.description && <p className="whitespace-pre-line leading-relaxed text-store-fg/80">{product.description}</p>}
          </section>
        )}
        <Reviews slug={product.slug} />
        <LandingFaq />
        <div className="text-center">
          <a href="#commander" className="inline-flex h-14 items-center rounded-store bg-store-accent px-8 text-lg font-bold text-white">
            {t(locale, "orderNow")}
          </a>
        </div>
      </div>

      {storeConfig.landing.stickyCta && (
        <StickyCta label={labels.orderNow} currency={labels.currency} initialPrice={product.packs.find((p) => p.highlight)?.price ?? product.price} />
      )}
    </main>
  );
}
