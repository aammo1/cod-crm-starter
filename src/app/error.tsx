"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

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
        <Button onClick={reset}>Réessayer</Button>
        <Button variant="outline" asChild>
          <Link href="/crm">Retour au CRM</Link>
        </Button>
      </div>
    </div>
  );
}
