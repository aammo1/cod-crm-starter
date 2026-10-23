import { StoreImage } from "@/components/storefront/ui/store-image";
import Link from "next/link";
import { storeConfig } from "@/config";
import { t } from "@/config/i18n";
import { CartButton } from "./cart-button";
import { MobileMenu } from "./mobile-menu";

export function Header() {
  const { locale, name, brand, nav } = storeConfig;
  const links = [
    { href: "/boutique", label: t(locale, "shop") },
    ...nav.categories.map((c) => ({ href: `/boutique/${c.slug}`, label: c.label })),
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-store-border bg-store-bg">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <MobileMenu links={links} label={t(locale, "menu")} navLabel={t(locale, "mainMenu")} />
        <Link href="/" className="inline-flex shrink-0 items-center">
          <StoreImage
            src={brand.logo}
            alt={name}
            width={brand.logoWidth}
            height={brand.logoHeight}
            priority
            sizes={`${brand.logoWidth}px`}
            className="h-auto max-h-10 w-auto"
          />
        </Link>
        <nav className="ms-6 hidden items-center gap-6 md:flex" aria-label={t(locale, "shop")}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium hover:text-store-accent">{l.label}</Link>
          ))}
        </nav>
        <div className="ms-auto">
          <CartButton label={t(locale, "cart")} />
        </div>
      </div>
    </header>
  );
}
