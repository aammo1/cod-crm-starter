import Link from "next/link";
import { AlertCircleIcon, AlertTriangleIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SubmittedSnapshot } from "./types";

export function CatalogUnavailable() {
  return (
  <div className="rounded-xl border border-[var(--crm-warning)]/30 bg-[var(--crm-warning-bg)] p-6 text-center">
    <h2 className="text-base font-semibold text-[var(--crm-warning)]">
      Catalogue indisponible
    </h2>
    <p className="mt-2 text-sm text-[var(--crm-warning)]/80">
      Aucun produit ou variante active n&apos;est actuellement disponible dans le catalogue pour créer une commande.
    </p>
    <div className="mt-6">
      <Button asChild variant="outline" className="border-[var(--crm-warning)]/40 text-[var(--crm-warning)] hover:bg-[var(--crm-warning-bg)]/80">
        <Link href="/crm/orders">Retour aux commandes</Link>
      </Button>
    </div>
  </div>
  );
}

export function ConflictBanner({ message, onDiscard }: { message: string; onDiscard: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--crm-danger)]/40 bg-[var(--crm-danger-bg)] p-4 text-[var(--crm-danger)]"
    >
      <div className="flex items-start gap-3">
        <AlertCircleIcon className="mt-0.5 size-5 shrink-0 text-[var(--crm-danger)]" aria-hidden />
        <div className="space-y-2">
          <h3 className="font-semibold text-[var(--crm-danger)]">Conflit de requête (409)</h3>
          <p className="text-sm text-[var(--crm-danger)]/90">{message}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onDiscard}
              className="border-[var(--crm-danger)]/40 text-[var(--crm-danger)] hover:bg-[var(--crm-danger-bg)]/80"
            >
              <RotateCcwIcon className="mr-1.5 size-3.5" aria-hidden />
              Créer un nouveau brouillon
            </Button>
            <Button asChild size="sm" variant="ghost" className="text-[var(--crm-danger)] hover:text-foreground">
              <Link href="/crm/orders">Consulter la liste des commandes</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UncertainBanner({
  snapshot,
  isModified,
  isSubmitting,
  onRetry,
  onRestore,
  onDiscard,
}: {
  snapshot: SubmittedSnapshot;
  isModified: boolean;
  isSubmitting: boolean;
  onRetry: () => void;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--crm-warning)]/50 bg-[var(--crm-warning-bg)] p-4 text-[var(--crm-warning)]"
    >
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-[var(--crm-warning)]" aria-hidden />
        <div className="space-y-2">
          <h3 className="font-semibold text-[var(--crm-warning)]">
            Requête précédente incertaine (perte de connexion)
          </h3>
          <p className="text-sm text-[var(--crm-warning)]/90">
            Le serveur a peut-être déjà enregistré cette commande avec l&apos;identifiant de requête{" "}
            <code className="rounded bg-muted px-1 text-xs text-foreground">
              {snapshot.requestId.slice(0, 8)}…
            </code>
            . Pour éviter tout doublon, vous devez d&apos;abord réassayer la requête originale.
          </p>
          {isModified ? (
            <div className="rounded-lg border border-[var(--crm-warning)]/30 bg-card/60 p-3 text-xs text-[var(--crm-warning)]">
              <p className="font-medium text-[var(--crm-warning)]">
                ⚠️ Les champs ont été modifiés depuis la tentative interrompue.
              </p>
              <p className="mt-1">
                Envoyer ces modifications sous le même identifiant provoquera une erreur 409. Rétablissez la saisie originale ou abandonnez ce brouillon.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              disabled={isSubmitting}
              onClick={onRetry}
              className="bg-[var(--crm-warning)] text-foreground font-medium hover:opacity-90"
            >
              {isSubmitting ? "Vérification en cours…" : "Réessayer la requête originale"}
            </Button>
            {isModified ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onRestore}
                className="border-[var(--crm-warning)]/40 text-[var(--crm-warning)] hover:bg-[var(--crm-warning-bg)]/80"
              >
                Rétablir la saisie originale
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDiscard}
              className="text-[var(--crm-warning)] hover:text-foreground"
            >
              Abandonner et recommencer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GeneralErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--crm-danger)]/30 bg-[var(--crm-danger-bg)] p-4 text-sm text-[var(--crm-danger)]"
    >
      {message}
    </div>
  );
}
