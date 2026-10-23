import { StoreImage } from "@/components/storefront/ui/store-image";
import Link from "next/link";
import { storeConfig } from "@/config";
import { t } from "@/config/i18n";

export function Categories() {
  const categories = storeConfig.nav.categories;
  if (categories.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h2 className="font-heading text-2xl font-semibold">{t(storeConfig.locale, "categories")}</h2>
      <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {categories.map((c) => (
          <li key={c.slug}>
            <Link href={`/boutique/${c.slug}`} className="relative flex aspect-[4/3] items-end overflow-hidden rounded-store bg-store-muted p-3">
              {c.image && <StoreImage src={c.image} alt="" sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />}
              <span className={`relative rounded-store px-2 py-1 text-sm font-semibold ${c.image ? "bg-store-bg/90" : ""}`}>{c.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
