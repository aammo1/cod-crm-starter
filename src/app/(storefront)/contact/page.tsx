import type { Metadata } from "next";
import { storeConfig, whatsappLink } from "@/config";
import { t } from "@/config/i18n";
import { ContentPage } from "@/components/storefront/content-page";

export const revalidate = false;

export const metadata: Metadata = { title: t(storeConfig.locale, "contact") };

export default function Page() {
  const { locale, contact } = storeConfig;
  return (
    <ContentPage title={t(locale, "contact")}>
      <ul className="space-y-3">
        <li>
          {t(locale, "phone")} :{" "}
          <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} dir="ltr" className="font-medium underline">{contact.phone}</a>
        </li>
        <li>
          <a href={whatsappLink()} target="_blank" rel="noopener" className="font-medium underline">{t(locale, "contactWhatsapp")}</a>
        </li>
        {contact.email && (
          <li><a href={`mailto:${contact.email}`} dir="ltr" className="font-medium underline">{contact.email}</a></li>
        )}
        <li>{contact.city}</li>
        {contact.hours && <li>{contact.hours}</li>}
      </ul>
    </ContentPage>
  );
}
