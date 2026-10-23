import localFont from "next/font/local";

// Fonts shared by the storefront and CRM root layouts (both import globals.css).
export const playfair = localFont({
  src: [
    { path: "./fonts/playfair-latin-var.woff2", weight: "400 900", style: "normal" },
    { path: "./fonts/playfair-latin-italic-var.woff2", weight: "400 900", style: "italic" },
  ],
  variable: "--font-playfair",
  fallback: ["Georgia", "Times New Roman", "serif"],
  display: "swap",
  // Playfair is the default heading font (store.config.ts brand.fonts.heading), so it is preloaded.
  // next/font needs static options; the CRM layout shares this object.
  preload: true,
});

export const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
  variable: "--font-inter",
  fallback: ["Arial", "Helvetica", "sans-serif"],
  display: "swap",
});

export const interNoPreload = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
  variable: "--font-inter",
  fallback: ["Arial", "Helvetica", "sans-serif"],
  display: "swap",
  preload: false,
});
