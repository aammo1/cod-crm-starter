import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { storeConfig, whatsappLink } from "@/config";
import { landingLabels, t } from "@/config/i18n";
import { getProduct, getShopSettings } from "@/lib/storefront/data";
import { customSections } from "@/custom";
import { Guarantees } from "@/components/storefront/home/guarantees";
import { InlineOrderForm } from "@/components/storefront/landing/inline-order-form";
import { LandingFaq } from "@/components/storefront/landing/landing-faq";
import { LandingHero } from "@/components/storefront/landing/landing-hero";
import { StickyCta } from "@/components/storefront/landing/sticky-cta";
import { BreadcrumbJsonLd } from "@/components/storefront/seo/breadcrumb-json-ld";
import { baseOpenGraph } from "@/lib/storefront/seo";
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
    alternates: { canonical: `/l/${product.slug}` },
    robots: { index: storeConfig.landing.index },
    openGraph: { ...baseOpenGraph({ title: product.name, description, images: product.images.slice(0, 1) }), type: "website", url: `/l/${product.slug}` },
    twitter: { card: "summary_large_image", title: product.name, description },
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

  // Same total the order form shows (net of packs, shipping included) so the CTA never disagrees with it.
  const initialNet = product.packs.find((p) => p.highlight)?.price ?? product.price;
  const initialTotal = initialNet + (initialNet >= settings.freeShippingThresholdMad ? 0 : settings.shippingFeeMad);

  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 lg:pb-12">
      <ProductJsonLd product={product} shippingFeeMad={settings.shippingFeeMad} />
      <BreadcrumbJsonLd items={[
        { name: storeConfig.name, path: "/" },
        { name: product.name, path: `/l/${product.slug}` },
      ]} />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-10">
        <LandingHero product={product} initialImages={defaultVariant?.images} />
        <div className="space-y-4 lg:sticky lg:top-4">
          <InlineOrderForm
            labels={labels}
            storeSlug={storeConfig.slug}
            leads={storeConfig.leads.enabled}
            whatsappHref={whatsappLink()}
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
          <a href="#commander" className="inline-flex h-14 items-center rounded-store bg-store-accent px-8 text-lg font-bold text-store-accent-fg">
            {t(locale, "orderNow")}
          </a>
        </div>
      </div>

      {storeConfig.landing.stickyCta && (
        <StickyCta label={labels.orderNow} currency={labels.currency} initialPrice={initialTotal} />
      )}
    </main>
  );
}
