import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { getStoreSettings } from "@/lib/services/store-settings";
import "./globals.css";

const playfair = localFont({
  src: [
    { path: "./fonts/playfair-latin-var.woff2", weight: "400 900", style: "normal" },
    { path: "./fonts/playfair-latin-italic-var.woff2", weight: "400 900", style: "italic" },
  ],
  variable: "--font-playfair",
  fallback: ["Georgia", "Times New Roman", "serif"],
  display: "swap",
  // Let styles request display faces where used instead of preloading both
  // normal and italic ahead of the first screen's CSS and product image.
  preload: false,
});

const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
  variable: "--font-inter",
  fallback: ["Arial", "Helvetica", "sans-serif"],
  display: "swap",
});

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${playfair.variable} ${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
