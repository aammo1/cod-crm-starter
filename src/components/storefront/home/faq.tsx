import { storeConfig } from "@/config";
import { t } from "@/config/i18n";

export function Faq() {
  const items = storeConfig.home.faq;
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <h2 className="font-heading text-2xl font-semibold">{t(storeConfig.locale, "faq")}</h2>
      <div className="mt-6 divide-y divide-store-border rounded-store border border-store-border">
        {items.map((item) => (
          <details key={item.q} className="group px-4 py-3">
            <summary className="cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden">{item.q}</summary>
            <p className="mt-2 text-sm text-store-fg/80">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
