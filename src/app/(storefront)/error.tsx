"use client";

import Link from "next/link";
import { useEffect } from "react";
import { t, type Locale } from "@/config/i18n";

// The locale is inlined at build time (next.config.ts); importing the validated config here would pull zod into the client.
const locale: Locale = process.env.NEXT_PUBLIC_STORE_LOCALE === "ar" ? "ar" : "fr";

const BTN =
  "inline-flex h-10 items-center justify-center rounded-store px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-store-primary";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Only the digest: server messages are already hidden from the browser in production.
    console.error("[ui] erreur de rendu", error.digest ?? "");
  }, [error]);

  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center text-store-fg">
      <h1 className="font-heading text-2xl font-semibold sm:text-3xl">{t(locale, "errorTitle")}</h1>
      <p className="mt-3 max-w-md text-sm opacity-70">{t(locale, "errorBody")}</p>
      {error.digest ? <p className="mt-2 text-xs opacity-70">{t(locale, "errorReference", { ref: error.digest })}</p> : null}
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={reset} className={`${BTN} bg-store-primary text-store-primary-fg hover:opacity-90`}>
          {t(locale, "errorRetry")}
        </button>
        <Link href="/" className={`${BTN} border border-store-border bg-store-bg hover:bg-store-muted`}>
          {t(locale, "errorHome")}
        </Link>
      </div>
    </div>
  );
}
