import type { Metadata } from "next";
import { storeConfig } from "@/config";
import { t } from "@/config/i18n";
import { TrackingForm, type TrackingLabels } from "@/components/storefront/tracking-lookup/tracking-form";

export const metadata: Metadata = { title: t(storeConfig.locale, "trackTitle"), robots: { index: false } };

export default function SuiviPage() {
  const { locale } = storeConfig;
  const labels: TrackingLabels = {
    orderNumber: t(locale, "orderNumber"), phone: t(locale, "phone"), phonePlaceholder: t(locale, "phonePlaceholder"),
    phoneInvalid: t(locale, "phoneInvalid"), submit: t(locale, "trackSubmit"), checking: t(locale, "trackChecking"),
    trackingNumber: t(locale, "trackTrackingNumber"), notFound: t(locale, "trackNotFound"),
    rateLimited: t(locale, "trackRateLimited"), genericError: t(locale, "genericError"),
    received: t(locale, "trackReceived"), confirmed: t(locale, "trackConfirmed"), shipped: t(locale, "trackShipped"),
    delivered: t(locale, "trackDelivered"), refused: t(locale, "trackRefused"), cancelled: t(locale, "trackCancelled"),
  };
  return (
    <main className="mx-auto max-w-md bg-store-bg px-4 py-16 text-store-fg">
      <h1 className="font-heading text-3xl font-semibold">{t(locale, "trackTitle")}</h1>
      <p className="mt-3 mb-8 opacity-80">{t(locale, "trackIntro")}</p>
      <TrackingForm labels={labels} />
    </main>
  );
}
