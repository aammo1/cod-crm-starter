import type { Metadata } from "next";
import { StoreSettingsForm } from "@/components/crm/store-settings-form";
import { requireAdmin } from "@/lib/auth-guards";
import { getStoreSettings } from "@/lib/services/store-settings";

export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "Paramètres",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  await requireAdmin();
  const settings = getStoreSettings();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Configuration de la boutique</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Paramètres</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Les règles enregistrées s’appliquent uniquement aux nouvelles commandes et aux nouvelles offres.
          Les montants et les délais déjà enregistrés sont conservés.
        </p>
      </header>
      <StoreSettingsForm initialSettings={settings} />
    </div>
  );
}
