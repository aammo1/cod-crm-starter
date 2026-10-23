import type { Metadata } from "next";
import { storeConfig } from "@/config";
import { t } from "@/config/i18n";
import { getCatalog } from "@/lib/storefront/data";
import { ProductGrid } from "@/components/storefront/product/product-grid";

export const revalidate = 300;

export const metadata: Metadata = {
  title: t(storeConfig.locale, "shop"),
  description: storeConfig.seo.description,
  alternates: { canonical: "/boutique" },
};

export default async function ShopPage() {
  const { locale } = storeConfig;
  const products = await getCatalog();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-heading text-3xl font-semibold">{t(locale, "shop")}</h1>
      <div className="mt-6">
        {products.length === 0 ? (
          <p className="text-store-fg/70">{t(locale, "noProducts")}</p>
        ) : (
          <ProductGrid products={products} priorityCount={4} />
        )}
      </div>
    </main>
  );
}
