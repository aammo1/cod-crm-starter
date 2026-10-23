import { storeConfig } from "@/config";
import { absoluteUrl, jsonLdScript } from "@/lib/storefront/seo";

// Organization + WebSite, e.g. {"@graph":[{"@type":"Organization","name":"X","url":"https://x.ma/","logo":"https://x.ma/brand/logo.webp"},{"@type":"WebSite",...}]}
export function SiteJsonLd() {
  const { name, brand, contact } = storeConfig;
  const social = (storeConfig as { social?: Record<string, string | undefined> }).social;
  const sameAs = social ? Object.values(social).filter((u): u is string => !!u) : [];
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name,
        url: absoluteUrl("/"),
        logo: absoluteUrl(brand.logo),
        ...(contact.email ? { email: contact.email } : {}),
        ...(sameAs.length ? { sameAs } : {}),
      },
      { "@type": "WebSite", name, url: absoluteUrl("/"), inLanguage: storeConfig.locale },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}
