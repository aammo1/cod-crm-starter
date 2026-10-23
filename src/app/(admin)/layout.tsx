import type { Metadata } from "next";
import { getStoreSettings } from "@/lib/services/store-settings";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const { storeName } = getStoreSettings();
  return {
    title: {
      default: `${storeName} — Gestion des commandes`,
      template: `%s | ${storeName}`,
    },
    description: "Gestion des commandes, du stock et des livraisons au Maroc.",
    robots: { index: false, follow: false },
  };
}

// The CRM stays French and LTR even when the storefront locale is Arabic.
export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="fr" dir="ltr" className="font-sans">
      {children}
    </div>
  );
}
