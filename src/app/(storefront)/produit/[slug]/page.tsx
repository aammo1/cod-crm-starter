import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { storeConfig } from "@/config";
import { buyBoxLabels, formatPrice, t } from "@/config/i18n";
import { getCrossSells, getProduct, getShopSettings } from "@/lib/storefront/data";
import { customSections } from "@/custom";
import { Gallery } from "@/components/storefront/product/gallery";
import { BuyBox } from "@/components/storefront/product/buy-box";
import { TrustBadges } from "@/components/storefront/product/trust-badges";
import { SizeGuide } from "@/components/storefront/product/size-guide";
import { Reviews } from "@/components/storefront/product/reviews";
import { ProductJsonLd } from "@/components/storefront/product/product-json-ld";
import { BreadcrumbJsonLd } from "@/components/storefront/seo/breadcrumb-json-ld";
import { baseOpenGraph } from "@/lib/storefront/seo";
import { ProductGrid } from "@/components/storefront/product/product-grid";

export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() { return []; }

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product || !product.active) return {};
  const description = product.description.slice(0, 160) || storeConfig.seo.description;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/produit/${product.slug}` },
    openGraph: { ...baseOpenGraph({ title: product.name, description, images: product.images.slice(0, 1) }), type: "website", url: `/produit/${product.slug}` },
    twitter: { card: "summary_large_image", title: product.name, description },
  };
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product || !product.active) notFound();
  const { locale } = storeConfig;
  const defaultVariant = product.variants.find((v) => v.available) ?? product.variants[0];
  const crossSells = await getCrossSells(product.id, 4);
  const settings = await getShopSettings();
  const sections = (storeConfig.customSections[product.slug] ?? []).flatMap((key) => {
    const Section = customSections[key];
    if (!Section) {
      if (process.env.NODE_ENV !== "production") console.warn(`[custom] Section inconnue "${key}" pour ${product.slug}`);
      return [];
    }
    return [{ key, Section }];
  });

  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-24">
      <ProductJsonLd product={product} shippingFeeMad={settings.shippingFeeMad} />
      <BreadcrumbJsonLd items={[
        { name: storeConfig.name, path: "/" },
        { name: product.name, path: `/produit/${product.slug}` },
      ]} />
      <div className="grid gap-8 md:grid-cols-2">
        <Gallery productId={product.id} name={product.name} images={product.images} initial={defaultVariant?.images} />
        <div className="space-y-5">
          <div>
            {product.badge && <p className="mb-1 text-sm font-semibold text-store-accent">{product.badge}</p>}
            <h1 className="font-heading text-2xl font-semibold sm:text-3xl">{product.name}</h1>
            <p className="mt-2 text-2xl font-semibold">{formatPrice(locale, product.price)}</p>
          </div>
          <BuyBox
            labels={buyBoxLabels(locale)}
            product={{
              id: product.id, slug: product.slug, name: product.name, price: product.price, images: product.images,
              optionDefinitions: product.optionDefinitions, variants: product.variants,
              packs: product.packs, landingEnabled: product.landingEnabled,
            }}
          />
          <TrustBadges />
        </div>
      </div>

      <div className="mt-10 space-y-8">
        {(product.description || product.story) && (
          <section className="max-w-3xl space-y-3">
            <h2 className="font-heading text-xl font-semibold">{t(locale, "productDescription")}</h2>
            {product.description && <p className="whitespace-pre-line leading-relaxed">{product.description}</p>}
            {product.story && <p className="whitespace-pre-line leading-relaxed text-store-fg/80">{product.story}</p>}
          </section>
        )}
        <SizeGuide category={product.category} />
        {sections.map(({ key, Section }) => <Section key={key} product={product} locale={locale} />)}
        <Reviews slug={product.slug} />
        {crossSells.length > 0 && (
          <section>
            <h2 className="mb-4 font-heading text-xl font-semibold">{t(locale, "youMayLike")}</h2>
            <ProductGrid products={crossSells} />
          </section>
        )}
      </div>
    </main>
  );
}
