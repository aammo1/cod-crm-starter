import { storeConfig } from "@/config";
import { t } from "@/config/i18n";

export function Testimonials() {
  const items = storeConfig.home.testimonials;
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h2 className="font-heading text-2xl font-semibold">{t(storeConfig.locale, "reviews")}</h2>
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {items.map((r, i) => (
          <li key={i} className="rounded-store border border-store-border p-4">
            <p className="text-store-accent" role="img" aria-label={t(storeConfig.locale, "ratingOutOf", { rating: r.rating })}>
              {"★".repeat(r.rating)}
              <span className="text-store-border">{"★".repeat(5 - r.rating)}</span>
            </p>
            <p className="mt-2 text-sm">{r.text}</p>
            <p className="mt-3 text-sm font-medium">{r.name}{r.city ? `, ${r.city}` : ""}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
