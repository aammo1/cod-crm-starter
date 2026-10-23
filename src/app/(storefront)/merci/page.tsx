import type { Metadata } from "next";
import { t } from "@/config/i18n";
import { storeConfig } from "@/config";
import { ThankYou } from "./thank-you";

export const metadata: Metadata = { robots: { index: false } };

export default function MerciPage() {
  const { locale, slug, contact } = storeConfig;
  return (
    <main className="mx-auto max-w-xl bg-store-bg px-4 py-16 text-center text-store-fg">
      <h1 className="font-heading text-3xl font-semibold">{t(locale, "thankYouTitle")}</h1>
      <p className="mt-3 mb-8 opacity-80">{t(locale, "thankYouText")}</p>
      <ThankYou locale={locale} storeSlug={slug} whatsapp={contact.whatsapp} />
    </main>
  );
}
