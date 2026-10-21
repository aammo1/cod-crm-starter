"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface CrmNavLink {
  href: string;
  label: string;
  adminOnly?: boolean;
}

export const CRM_NAV_LINKS: CrmNavLink[] = [
  { href: "/crm", label: "Tableau de bord" },
  { href: "/crm/orders", label: "Commandes" },
  { href: "/crm/expeditions", label: "Expéditions" },
  { href: "/crm/retours", label: "Retours" },
  { href: "/crm/stock", label: "Stock" },
  { href: "/crm/equipe", label: "Équipe", adminOnly: true },
  { href: "/admin", label: "Catalogue produits", adminOnly: true },
];

export function getCrmCurrentSectionTitle(pathname: string): string {
  if (pathname === "/crm") return "Tableau de bord";
  const matches = CRM_NAV_LINKS.filter(
    (link) =>
      link.href !== "/crm" &&
      (pathname === link.href || pathname.startsWith(link.href + "/")),
  ).sort((a, b) => b.href.length - a.href.length);

  if (matches.length > 0) {
    return matches[0].label;
  }
  return "Tableau de bord";
}

export interface CrmNavProps {
  isAdmin?: boolean;
  onNavigate?: () => void;
  className?: string;
}

export function CrmNav({ isAdmin = false, onNavigate, className }: CrmNavProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/crm") return pathname === "/crm";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const links = CRM_NAV_LINKS.filter((link) => !link.adminOnly || isAdmin);

  return (
    <nav aria-label="Navigation CRM" className={cn("flex flex-col gap-1", className)}>
      {links.map((link) => {
        const active = isActive(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none",
              active
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
