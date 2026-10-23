import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { storeConfig, htmlDir } from "@/config";
import "./globals.css";

const playfair = localFont({
  src: [
    { path: "./fonts/playfair-latin-var.woff2", weight: "400 900", style: "normal" },
    { path: "./fonts/playfair-latin-italic-var.woff2", weight: "400 900", style: "italic" },
  ],
  variable: "--font-playfair",
  fallback: ["Georgia", "Times New Roman", "serif"],
  display: "swap",
  preload: false,
});

const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
  variable: "--font-inter",
  fallback: ["Arial", "Helvetica", "sans-serif"],
  display: "swap",
});

const interNoPreload = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
  variable: "--font-inter",
  fallback: ["Arial", "Helvetica", "sans-serif"],
  display: "swap",
  preload: false,
});

const cairoPreload = localFont({
  src: "./fonts/cairo-arabic-var.woff2",
  weight: "200 1000",
  variable: "--font-cairo",
  fallback: ["system-ui", "Arial", "sans-serif"],
  display: "swap",
});

const cairoNoPreload = localFont({
  src: "./fonts/cairo-arabic-var.woff2",
  weight: "200 1000",
  variable: "--font-cairo",
  fallback: ["system-ui", "Arial", "sans-serif"],
  display: "swap",
  preload: false,
});

const cairo = storeConfig.locale === "ar" ? cairoPreload : cairoNoPreload;

const interFont = storeConfig.brand.fonts.body === "inter" ? inter : interNoPreload;

const { brand, seo } = storeConfig;

export const metadata: Metadata = {
  title: { default: seo.title, template: `%s | ${storeConfig.name}` },
  description: seo.description,
  metadataBase: new URL(storeConfig.domain),
  openGraph: {
    title: seo.title,
    description: seo.description,
    siteName: storeConfig.name,
    ...(seo.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
  },
  ...(brand.icon ? { icons: { icon: brand.icon } } : {}),
};

const RADIUS = { none: "0px", sm: "0.25rem", md: "0.5rem", lg: "0.875rem", full: "9999px" } as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const c = brand.colors;
  const radius = RADIUS[brand.radius];
  const themeCss = `:root{--store-primary:${c.primary};--store-primary-fg:${c.primaryForeground};--store-accent:${c.accent};--store-bg:${c.background};--store-fg:${c.foreground};--store-muted:${c.muted};--store-border:${c.border};--store-radius:${radius}}`;
  return (
    <html lang={storeConfig.locale} dir={htmlDir} suppressHydrationWarning>
      <head>
        <style>{themeCss}</style>
      </head>
      <body
        className={`${playfair.variable} ${interFont.variable} ${cairo.variable} font-sans antialiased`}
        data-heading-font={brand.fonts.heading}
        data-body-font={brand.fonts.body}
      >
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
