import { storeConfig } from "@/config";
import type { StorefrontProductView } from "@/lib/services/catalog";

export function ProductJsonLd({ product }: { product: StorefrontProductView }) {
  const base = storeConfig.domain.replace(/\/+$/, "");
  const abs = (u: string) => (u.startsWith("http") ? u : `${base}${u}`);
  const rated = storeConfig.product.reviews.filter((r) => r.productSlug === product.slug);
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.variants[0]?.sku,
    image: product.images.map(abs),
    brand: { "@type": "Brand", name: storeConfig.name },
    offers: {
      "@type": "Offer",
      url: `${base}/produit/${product.slug}`,
      priceCurrency: "MAD",
      price: product.price,
      availability: product.variants.some((v) => v.available)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
    ...(rated.length > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number((rated.reduce((n, r) => n + r.rating, 0) / rated.length).toFixed(1)),
            reviewCount: rated.length,
          },
        }
      : {}),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
