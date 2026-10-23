import { storeConfig } from "@/config";
import type { StorefrontProductView } from "@/lib/services/catalog";
import { absoluteUrl, jsonLdScript } from "@/lib/storefront/seo";

// Hand-written store.config reviews are intentionally NOT emitted (Google self-serving review
// policy): no aggregateRating / review. Example output for variants at 149 and 179 MAD:
// "offers":{"@type":"AggregateOffer","priceCurrency":"MAD","lowPrice":149,"highPrice":179,"offerCount":2,...}
export function ProductJsonLd({ product, shippingFeeMad }: { product: StorefrontProductView; shippingFeeMad?: number }) {
  const url = absoluteUrl(`/produit/${product.slug}`);
  const priceValidUntil = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  // Variants currently share the product price; honour a per-variant price if the DTO ever carries one.
  const prices = product.variants.map((v) => (v as { price?: number }).price ?? product.price);
  const low = prices.length ? Math.min(...prices) : product.price;
  const high = prices.length ? Math.max(...prices) : product.price;
  const availability = product.variants.some((v) => v.available)
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
  const common = {
    priceCurrency: "MAD",
    availability,
    url,
    priceValidUntil,
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "MA" },
      ...(shippingFeeMad === undefined
        ? {}
        : { shippingRate: { "@type": "MonetaryAmount", value: shippingFeeMad, currency: "MAD" } }),
    },
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "MA",
      url: absoluteUrl("/livraison-retours"),
    },
  };
  const offers = low !== high
    ? { "@type": "AggregateOffer", lowPrice: low, highPrice: high, offerCount: prices.length, ...common }
    : { "@type": "Offer", price: low, ...common };
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.variants[0]?.sku,
    image: product.images.map(absoluteUrl),
    brand: { "@type": "Brand", name: storeConfig.name },
    offers,
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}
