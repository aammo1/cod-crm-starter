import { absoluteUrl, jsonLdScript } from "@/lib/storefront/seo";

// e.g. [{name:"Accueil",path:"/"},{name:"Produit",path:"/produit/x"}] -> BreadcrumbList with positions 1..n
export function BreadcrumbJsonLd({ items }: { items: { name: string; path: string }[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem", position: i + 1, name: item.name, item: absoluteUrl(item.path),
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}
