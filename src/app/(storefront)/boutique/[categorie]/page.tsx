import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { storeConfig } from "@/config";
import { t } from "@/config/i18n";
import { getCatalog } from "@/lib/storefront/data";
import { ProductGrid } from "@/components/storefront/product/product-grid";

export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() { return []; }

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Category = nav entry (slug) matched against the product category text, exactly or slugified. */
async function resolve(slug: string) {
  const catalog = await getCatalog();
  const nav = storeConfig.nav.categories.find((c) => c.slug === slug);
  const names = new Set([slug, nav?.label].filter((s): s is string => !!s));
  const products = catalog.filter((p) => names.has(p.category) || slugify(p.category) === slug || (nav && slugify(p.category) === slugify(nav.label)));
  const label = nav?.label ?? products[0]?.category;
  return { products, label };
}

export async function generateMetadata({ params }: { params: Promise<{ categorie: string }> }): Promise<Metadata> {
  const { categorie } = await params;
  const { label } = await resolve(categorie);
  return label ? { title: label, alternates: { canonical: `/boutique/${categorie}` } } : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ categorie: string }> }) {
  const { categorie } = await params;
  const { products, label } = await resolve(categorie);
  if (!label) notFound();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-heading text-3xl font-semibold">{label}</h1>
      <div className="mt-6">
        {products.length === 0 ? (
          <p className="text-store-fg/70">{t(storeConfig.locale, "noProducts")}</p>
        ) : (
          <ProductGrid products={products} priorityCount={4} />
        )}
      </div>
    </main>
  );
}
