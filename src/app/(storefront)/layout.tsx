import type { Metadata } from "next";
import localFont from "next/font/local";
import { storeConfig, htmlDir, whatsappLink } from "@/config";
import { t } from "@/config/i18n";
import { playfair, inter, interNoPreload } from "../fonts";
import "../globals.css";
import { getShopSettings } from "@/lib/storefront/data";
import { CartProvider } from "@/stores/cart-provider";
import { FunnelHost } from "@/components/storefront/funnel/funnel-host";
import { SiteJsonLd } from "@/components/storefront/seo/site-json-ld";
import { baseOpenGraph } from "@/lib/storefront/seo";
import { Pixels } from "@/components/storefront/tracking/pixels";
import { AnnouncementBar } from "@/components/storefront/layout/announcement-bar";
import { Header } from "@/components/storefront/layout/header";
import { Footer } from "@/components/storefront/layout/footer";
import { WhatsAppButton } from "@/components/storefront/layout/whatsapp-button";

const cairoPreload = localFont({
  src: "../fonts/cairo-arabic-var.woff2",
  weight: "200 1000",
  variable: "--font-cairo",
  fallback: ["system-ui", "Arial", "sans-serif"],
  display: "swap",
});

const cairoNoPreload = localFont({
  src: "../fonts/cairo-arabic-var.woff2",
  weight: "200 1000",
  variable: "--font-cairo",
  fallback: ["system-ui", "Arial", "sans-serif"],
  display: "swap",
  preload: false,
});

const cairo = storeConfig.locale === "ar" ? cairoPreload : cairoNoPreload;

const interFont = storeConfig.brand.fonts.body === "inter" ? inter : interNoPreload;

const { brand, seo } = storeConfig;

export const metadata: Metadata = {
  title: { default: seo.title, template: `%s | ${storeConfig.name}` },
  description: seo.description,
  metadataBase: new URL(storeConfig.domain),
  openGraph: baseOpenGraph(),
  twitter: { card: "summary_large_image" },
  ...(brand.icon ? { icons: { icon: brand.icon } } : {}),
};

const RADIUS = { none: "0px", sm: "0.25rem", md: "0.5rem", lg: "0.875rem", full: "9999px" } as const;

// This group is its own root layout: the storefront document carries the store locale and
// direction, while the CRM group (src/app/(admin)/layout.tsx) has its own French LTR document so
// portals (sheets, dialogs, toasts) rendered into <body> never inherit the storefront direction.
// Static shell: no cookies/headers/auth; data only through cached loaders.
export const revalidate = 300;

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const settings = await getShopSettings();
  const c = storeConfig;
  const bc = brand.colors;
  const radius = RADIUS[brand.radius];
  const themeCss = `:root{--store-primary:${bc.primary};--store-primary-fg:${bc.primaryForeground};--store-accent:${bc.accent};--store-accent-fg:${bc.accentForeground};--store-bg:${bc.background};--store-fg:${bc.foreground};--store-muted:${bc.muted};--store-border:${bc.border};--store-radius:${radius}}`;
  return (
    <html lang={storeConfig.locale} dir={htmlDir} suppressHydrationWarning>
      <head>
        <style>{themeCss}</style>
        <SiteJsonLd />
      </head>
      <body
        className={`${playfair.variable} ${interFont.variable} ${cairo.variable} font-sans antialiased`}
        data-heading-font={brand.fonts.heading}
        data-body-font={brand.fonts.body}
      >
        <CartProvider storeSlug={c.slug}>
          <div className="min-h-dvh bg-store-bg text-store-fg">
            {c.announcement.length > 0 && <AnnouncementBar messages={c.announcement} />}
            <Header />
            {/* Pages render their own <main>. */}
            <div>{children}</div>
            <Footer />
            <WhatsAppButton href={whatsappLink()} label={t(storeConfig.locale, "contactWhatsapp")} />
            <FunnelHost
              locale={c.locale}
              storeSlug={c.slug}
              whatsapp={c.contact.whatsapp}
              shippingFeeMad={settings.shippingFeeMad}
              freeShippingThresholdMad={settings.freeShippingThresholdMad}
              leadsEnabled={c.leads.enabled}
            />
            <Pixels metaPixelId={c.tracking.metaPixelId} tiktokPixelId={c.tracking.tiktokPixelId} />
          </div>
        </CartProvider>
      </body>
    </html>
  );
}
