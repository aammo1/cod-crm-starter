import { storeConfig } from "@/config";
import { t } from "@/config/i18n";

export function LandingFaq() {
  const items = storeConfig.home.faq;
  if (items.length === 0) return null;
  return (
    <section className="max-w-3xl">
      <h2 className="font-heading text-xl font-semibold">{t(storeConfig.locale, "faq")}</h2>
      <div className="mt-4 divide-y divide-store-border rounded-store border border-store-border">
        {items.map((item) => (
          <details key={item.q} className="px-4 py-3">
            <summary className="cursor-pointer font-medium">{item.q}</summary>
            <p className="mt-2 text-sm text-store-fg/80">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
