import { StoreImage } from "@/components/storefront/ui/store-image";
import Link from "next/link";
import { storeConfig } from "@/config";
import { formatPrice, t } from "@/config/i18n";
import type { StorefrontProductView } from "@/lib/services/catalog";

export function ProductCard({ product, priority = false }: { product: StorefrontProductView; priority?: boolean }) {
  const { locale } = storeConfig;
  const image = product.images[0];
  const soldOut = !product.variants.some((v) => v.available);
  return (
    <Link href={`/produit/${product.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-store bg-store-muted">
        {image && (
          <StoreImage
            src={image}
            alt={product.name}
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        {product.badge && (
          <span className="absolute start-2 top-2 rounded-store bg-store-accent px-2 py-0.5 text-xs font-semibold text-white">
            {product.badge}
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-store-bg/70 text-sm font-semibold">
            {t(locale, "soldOut")}
          </span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-medium">{product.name}</h3>
      <p className="mt-0.5 text-sm font-semibold">{formatPrice(locale, product.price)}</p>
    </Link>
  );
}
