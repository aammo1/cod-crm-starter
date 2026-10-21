import type { Metadata } from "next";
import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import { signOut } from "@/auth";

import { requireAdmin } from "@/lib/auth-guards";
import { getStoreSettings } from "@/lib/services/store-settings";

export function generateMetadata(): Metadata {
  const { storeName } = getStoreSettings();
  return {
    title: { default: "Administration", template: `%s | ${storeName}` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const { storeName } = getStoreSettings();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-dvh bg-noir text-white">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-white/10 px-4 py-6 md:flex">
        <Link href="/admin" className="mb-8 block px-3">
          <p className="break-words font-display text-2xl font-semibold tracking-wide text-white">
            {storeName}
          </p>
          <p className="mt-1 text-xs text-white/40">Administration</p>
        </Link>
        <nav aria-label="Navigation admin" className="flex flex-col gap-1">
          <Link
            href="/admin"
            className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            Produits
          </Link>
          <Link
            href="/crm"
            className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            CRM
          </Link>
          <Link href="/crm/equipe" className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white">
            Équipe
          </Link>
          <Link href="/crm/parametres" className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white">
            Paramètres
          </Link>
        </nav>
        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="mb-3 px-3">
            <p className="truncate text-sm font-medium text-white">
              {user.name ?? user.email}
            </p>
            <p className="text-xs text-white/40">Administrateur</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOutIcon className="size-4" aria-hidden />
              Déconnexion
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 md:hidden">
          <Link href="/admin" className="min-w-0">
            <p className="break-words font-display text-xl font-semibold text-white">{storeName}</p>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Déconnexion"
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm text-white/60 hover:text-white"
            >
              <LogOutIcon className="size-4" aria-hidden />
            </button>
          </form>
        </header>
        <nav aria-label="Navigation admin mobile" className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-2 md:hidden">
          <Link href="/admin" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-white/70 hover:bg-white/5 hover:text-white">Produits</Link>
          <Link href="/crm" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-white/70 hover:bg-white/5 hover:text-white">CRM</Link>
          <Link href="/crm/equipe" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-white/70 hover:bg-white/5 hover:text-white">Équipe</Link>
          <Link href="/crm/parametres" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-white/70 hover:bg-white/5 hover:text-white">Paramètres</Link>
        </nav>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
