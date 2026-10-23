import Link from "next/link";
import { storeConfig } from "@/config";
import { t } from "@/config/i18n";
import { getBestSellers } from "@/lib/storefront/data";
import { ProductGrid } from "../product/product-grid";

export async function BestSellers() {
  const products = await getBestSellers(8);
  if (products.length === 0) return null;
  const { locale } = storeConfig;
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-2xl font-semibold">{t(locale, "bestSellers")}</h2>
        <Link href="/boutique" className="text-sm underline">{t(locale, "viewAll")}</Link>
      </div>
      <ProductGrid products={products} />
    </section>
  );
}
