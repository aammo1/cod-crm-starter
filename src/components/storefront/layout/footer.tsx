import Link from "next/link";
import { storeConfig, whatsappLink } from "@/config";
import { t } from "@/config/i18n";

export function Footer() {
  const { locale, name, contact } = storeConfig;
  const links = [
    { href: "/a-propos", label: t(locale, "about") },
    { href: "/contact", label: t(locale, "contact") },
    { href: "/livraison-retours", label: t(locale, "shippingReturns") },
    { href: "/cgv", label: t(locale, "terms") },
    { href: "/confidentialite", label: t(locale, "privacy") },
  ];
  return (
    <footer className="mt-16 border-t border-store-border bg-store-muted">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2">
        <div className="space-y-2 text-sm">
          <p className="font-heading text-lg font-semibold">{name}</p>
          <p>{contact.city}</p>
          {contact.hours && <p>{contact.hours}</p>}
          <p>
            <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} dir="ltr" className="hover:underline">{contact.phone}</a>
          </p>
          <p>
            <a href={whatsappLink()} target="_blank" rel="noopener" className="hover:underline">{t(locale, "contactWhatsapp")}</a>
          </p>
          <p className="inline-block rounded-store border border-store-border bg-store-bg px-3 py-1 text-xs font-medium">{t(locale, "cod")}</p>
        </div>
        <nav aria-label={t(locale, "information")}>
          <ul className="space-y-2 text-sm">
            {links.map((l) => (
              <li key={l.href}><Link href={l.href} className="hover:underline">{l.label}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="border-t border-store-border py-4 text-center text-xs opacity-70">
        © {new Date().getFullYear()} {name}
      </p>
    </footer>
  );
}
