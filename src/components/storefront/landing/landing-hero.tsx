import { storeConfig } from "@/config";
import { formatPrice, t } from "@/config/i18n";
import type { PublicCommerceProduct } from "@/lib/commerce-types";
import { Gallery } from "@/components/storefront/product/gallery";
import { productReviews } from "@/components/storefront/product/reviews";

/** Lowest per-unit price across the base price and active packs (rounded up: never understate). */
export function lowestUnitPrice(product: Pick<PublicCommerceProduct, "price" | "packs">): number {
  return product.packs.reduce((min, p) => Math.min(min, Math.ceil(p.price / p.quantity)), product.price);
}

export function LandingHero({ product, initialImages }: { product: PublicCommerceProduct; initialImages?: string[] }) {
  const { locale } = storeConfig;
  const reviews = productReviews(product.slug);
  const rating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const stars = Math.round(rating);
  return (
    <div className="space-y-4">
      <Gallery productId={product.id} name={product.name} images={product.images} initial={initialImages} />
      <div>
        {product.badge && <p className="mb-1 text-sm font-semibold text-store-accent">{product.badge}</p>}
        <h1 className="font-heading text-2xl font-semibold sm:text-3xl">{product.name}</h1>
        {reviews.length > 0 && (
          <p className="mt-1 text-store-accent" role="img" aria-label={t(locale, "ratingOutOf", { rating: rating.toFixed(1) })}>
            {"★".repeat(stars)}<span className="text-store-border">{"★".repeat(5 - stars)}</span>
            <span className="ms-2 text-sm text-store-fg/70">({reviews.length})</span>
          </p>
        )}
        <p className="mt-2 text-xl font-semibold">{t(locale, "startingAt", { price: formatPrice(locale, lowestUnitPrice(product)) })}</p>
      </div>
    </div>
  );
}
