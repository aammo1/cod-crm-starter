"use client";

import Link from "next/link";
import { useEffect } from "react";

const BTN =
  "inline-flex h-9 items-center justify-center rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Only the digest: server messages are already hidden from the browser in production.
    console.error("[ui] erreur de rendu", error.digest ?? "");
  }, [error]);

  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Une erreur est survenue</h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        La page n&apos;a pas pu être chargée. Réessayez ; si le problème persiste, contactez l&apos;administrateur.
      </p>
      {error.digest ? <p className="mt-2 text-xs text-muted-foreground">Référence : {error.digest}</p> : null}
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={reset} className={`${BTN} bg-primary text-primary-foreground hover:bg-primary/90`}>
          Réessayer
        </button>
        <Link href="/crm" className={`${BTN} border bg-background hover:bg-accent hover:text-accent-foreground`}>
          Retour au CRM
        </Link>
      </div>
    </div>
  );
}
