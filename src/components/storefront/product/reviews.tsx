import { storeConfig } from "@/config";
import { t } from "@/config/i18n";

/** Reviews for this product plus generic ones (no productSlug). */
export function productReviews(slug: string) {
  return storeConfig.product.reviews.filter((r) => !r.productSlug || r.productSlug === slug);
}

export function Reviews({ slug }: { slug: string }) {
  const reviews = productReviews(slug);
  if (reviews.length === 0) return null;
  return (
    <section aria-labelledby="reviews-title">
      <h2 id="reviews-title" className="font-heading text-xl font-semibold">{t(storeConfig.locale, "reviews")}</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {reviews.map((r, i) => (
          <li key={i} className="rounded-store border border-store-border p-4">
            <p className="text-store-accent" role="img" aria-label={t(storeConfig.locale, "ratingOutOf", { rating: r.rating })}>
              {"★".repeat(r.rating)}
              <span className="text-store-border">{"★".repeat(5 - r.rating)}</span>
            </p>
            <p className="mt-2 text-sm">{r.text}</p>
            <p className="mt-2 text-sm font-medium">{r.name}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
