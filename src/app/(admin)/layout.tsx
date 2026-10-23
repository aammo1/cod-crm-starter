import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { getStoreSettings } from "@/lib/services/store-settings";
import { playfair, inter } from "../fonts";
import "../globals.css";

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

// The CRM is its own root document: always French and LTR, even when the storefront locale is
// Arabic. Portals (sheets, dialogs, selects) and the Toaster render into this <body>.
export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" dir="ltr" suppressHydrationWarning>
      <body className={`${playfair.variable} ${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
