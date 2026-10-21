"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOutIcon, MenuIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CrmNav, getCrmCurrentSectionTitle } from "@/components/crm/crm-nav";
import { CrmThemeToggle } from "@/components/crm/crm-theme-toggle";

export interface CrmMobileNavProps {
  storeName: string;
  userName: string;
  userRole: "admin" | "agent";
  isAdmin: boolean;
  logoutAction: () => Promise<void>;
}

export function CrmMobileNav({
  storeName,
  userName,
  userRole,
  isAdmin,
  logoutAction,
}: CrmMobileNavProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const currentTitle = getCrmCurrentSectionTitle(pathname);

  // Close drawer when pathname changes (including back/forward navigation)
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close drawer if screen is resized to desktop breakpoint
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 768px)");
    const handleResize = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setOpen(false);
      }
    };
    mql.addEventListener("change", handleResize);
    return () => mql.removeEventListener("change", handleResize);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu de navigation"
          title="Ouvrir le menu"
          className="min-h-[44px] min-w-[44px]"
        >
          <MenuIcon className="size-5" aria-hidden="true" />
        </Button>

        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            {storeName}
          </span>
          <span className="text-sm font-bold text-foreground">
            {currentTitle}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <CrmThemeToggle className="min-h-[44px] min-w-[44px]" />
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="flex h-full w-4/5 max-w-xs flex-col border-r border-border bg-card p-0 text-foreground"
        >
          <SheetHeader className="flex flex-row items-center justify-between border-b border-border p-4">
            <Link
              href="/crm"
              onClick={() => setOpen(false)}
              className="flex min-w-0 flex-col"
            >
              <SheetTitle className="break-words text-lg font-bold text-foreground">
                {storeName}
              </SheetTitle>
              <span className="text-xs text-muted-foreground">
                Espace équipe
              </span>
            </Link>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
              title="Fermer le menu"
              className="min-h-[44px] min-w-[44px]"
            >
              <XIcon className="size-5" aria-hidden="true" />
              <span className="sr-only">Fermer le menu</span>
            </Button>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            <CrmNav
              isAdmin={isAdmin}
              onNavigate={() => setOpen(false)}
            />
          </div>

          <div className="border-t border-border p-4">
            <div className="mb-3 px-1">
              <p className="truncate text-sm font-medium text-foreground">
                {userName}
              </p>
              <p className="text-xs text-muted-foreground">
                {userRole === "admin" ? "Administrateur" : "Agent"}
              </p>
            </div>

            <form action={logoutAction}>
              <button
                type="submit"
                className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOutIcon className="size-4" aria-hidden="true" />
                Déconnexion
              </button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
