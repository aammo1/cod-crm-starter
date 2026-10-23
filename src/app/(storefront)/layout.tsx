import { storeConfig } from "@/config";
import { getShopSettings } from "@/lib/storefront/data";
import { CartProvider } from "@/stores/cart-provider";
import { FunnelHost } from "@/components/storefront/funnel/funnel-host";
import { Pixels } from "@/components/storefront/tracking/pixels";
import { AnnouncementBar } from "@/components/storefront/layout/announcement-bar";
import { Header } from "@/components/storefront/layout/header";
import { Footer } from "@/components/storefront/layout/footer";
import { WhatsAppButton } from "@/components/storefront/layout/whatsapp-button";

// Static shell: no cookies/headers/auth; data only through cached loaders.
export const revalidate = 300;

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const settings = await getShopSettings();
  const c = storeConfig;
  return (
    <CartProvider storeSlug={c.slug}>
      <div className="min-h-dvh bg-store-bg text-store-fg">
        {c.announcement.length > 0 && <AnnouncementBar messages={c.announcement} />}
        <Header />
        {/* Pages render their own <main>. */}
        <div>{children}</div>
        <Footer />
        <WhatsAppButton />
        <FunnelHost
          locale={c.locale}
          storeSlug={c.slug}
          whatsapp={c.contact.whatsapp}
          shippingFeeMad={settings.shippingFeeMad}
          freeShippingThresholdMad={settings.freeShippingThresholdMad}
        />
        <Pixels metaPixelId={c.tracking.metaPixelId} tiktokPixelId={c.tracking.tiktokPixelId} />
      </div>
    </CartProvider>
  );
}
