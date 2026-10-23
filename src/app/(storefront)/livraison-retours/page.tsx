import type { Metadata } from "next";
import { storeConfig } from "@/config";
import { t } from "@/config/i18n";
import { ContentPage } from "@/components/storefront/content-page";

export const revalidate = false;

export const metadata: Metadata = { title: t(storeConfig.locale, "shippingReturns") };

export default function Page() {
  return <ContentPage title={t(storeConfig.locale, "shippingReturns")} text={storeConfig.legal.shipping} />;
}
