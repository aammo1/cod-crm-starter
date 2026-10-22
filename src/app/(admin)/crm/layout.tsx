import type { Metadata } from "next";
import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import { signOut } from "@/auth";

import "./crm-theme.css";
import { CrmThemeProvider } from "@/components/crm/crm-theme-provider";
import { CrmThemeToggle } from "@/components/crm/crm-theme-toggle";
import { CrmNav } from "@/components/crm/crm-nav";
import { CrmMobileNav } from "@/components/crm/crm-mobile-nav";
import { CrmAssistant } from "@/components/crm/crm-assistant";
import { requireUser } from "@/lib/auth-guards";
import { getStoreSettings } from "@/lib/services/store-settings";

export function generateMetadata(): Metadata {
  const { storeName } = getStoreSettings();
  return {
    title: { default: "CRM", template: `%s | ${storeName}` },
    robots: { index: false, follow: false },
  };
}

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const { storeName } = getStoreSettings();
  const isAdmin = user.role === "admin";
  const displayName = user.name ?? user.email ?? "Utilisateur";

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <CrmThemeProvider>
      <div className="flex min-h-dvh bg-background text-foreground">
        {/* Desktop Sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card px-4 py-6 md:flex">
          <div className="mb-6 flex items-center justify-between px-3">
            <Link href="/crm" className="block min-w-0">
              <p className="break-words text-xl font-bold tracking-tight text-foreground">
                {storeName}
              </p>
              <p className="text-xs text-muted-foreground">Espace équipe</p>
            </Link>
            <CrmThemeToggle />
          </div>

          <div className="flex-1 overflow-y-auto">
            <CrmNav isAdmin={isAdmin} />
          </div>

          <div className="mt-auto border-t border-border pt-4">
            <div className="mb-3 px-3">
              <p className="truncate text-sm font-semibold text-foreground">
                {displayName}
              </p>
              <p className="text-xs text-muted-foreground">
                {isAdmin ? "Administrateur" : "Agent"}
              </p>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOutIcon className="size-4" aria-hidden="true" />
                Déconnexion
              </button>
            </form>
          </div>
        </aside>

        {/* Mobile Header + Main Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <CrmMobileNav
            storeName={storeName}
            userName={displayName}
            userRole={user.role}
            isAdmin={isAdmin}
            logoutAction={logout}
          />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:px-8 md:py-10 md:pb-28">
            {children}
          </main>
        </div>
      </div>
      {/* Hidden until configured: the API would only answer 503. */}
      {isAdmin && process.env.OPENROUTER_API_KEY?.trim() ? <CrmAssistant /> : null}
    </CrmThemeProvider>
  );
}
