import { storeConfig, htmlDir } from "@/config";
import { NotFoundContent } from "@/components/shared/not-found-content";
import { interNoPreload } from "./fonts";
import "./globals.css";

// Unmatched URLs (no route group applies): document matches the store locale.
export const metadata = { title: "404", robots: { index: false, follow: false } };

export default function GlobalNotFound() {
  return (
    <html lang={storeConfig.locale} dir={htmlDir}>
      <body className={`${interNoPreload.variable} font-sans antialiased`}>
        <NotFoundContent locale={storeConfig.locale} href="/" />
      </body>
    </html>
  );
}
