"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDownIcon,
  HandIcon,
  InfoIcon,
  PackageCheckIcon,
  TruckIcon,
} from "lucide-react";

import { BlPrintActions } from "@/components/crm/bl-print-actions";
import { CopyButton } from "@/components/crm/copy-button";
import { BlOperationCard } from "@/components/crm/bl-operation-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "cn";
import { formatMad } from "@/lib/pricing";
import { explainWithAssistant, useAssistantSelection } from "@/stores/assistant-context";
import type {
  BoardDispatchedOrder,
  BoardNote,
  BoardParcel,
  BoardBlOperation,
} from "@/lib/services/expeditions";

// Timestamps arrive pre-formatted (Africa/Casablanca) from the server page —
// see src/lib/services/expeditions.ts.

async function readError(data: Record<string, unknown> | null): Promise<string | null> {
  return typeof data?.error === "string" ? data.error : null;
}

async function postJson(
  url: string,
  body?: unknown,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

function Section({
  id,
  title,
  count,
  icon,
  initiallyOpen,
  children,
}: {
  id: string;
  title: string;
  count: number;
  icon?: React.ReactNode;
  initiallyOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(initiallyOpen ?? count > 0);
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <h2>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={`${id}-content`}
        onClick={() => setIsOpen((previous) => !previous)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2.5">
          {icon}
          <span
            id={`${id}-title`}
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {title}
          </span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
              count > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {count}
          </span>
        </span>
        <ChevronDownIcon
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
            isOpen && "rotate-180 text-foreground",
          )}
          aria-hidden="true"
        />
      </button>
      </h2>
      <div id={`${id}-content`} role="region" aria-labelledby={`${id}-title`} hidden={!isOpen} className={cn(!isOpen && "hidden")}>
        {children}
      </div>
    </section>
  );
}

function ParcelFacts({ parcel }: { parcel: BoardParcel }) {
  return (
    <>
      <span className="font-mono text-xs text-primary">{parcel.orderId}</span>
      <span className="text-sm font-medium text-foreground">{parcel.customerName}</span>
      {parcel.cityName ? (
        <span className="text-xs text-muted-foreground">{parcel.cityName}</span>
      ) : null}
      <span className="ml-auto text-xs uppercase tracking-wide text-muted-foreground">COD</span>
      <span className="text-sm font-semibold whitespace-nowrap text-foreground">
        {formatMad(parcel.total)}
      </span>
    </>
  );
}

function TrackingCell({ tracking }: { tracking: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-foreground/80">
      <span className="shrink-0 text-muted-foreground">Suivi :</span>
      <span onClick={(event) => event.stopPropagation()}>
        <CopyButton value={tracking} label={tracking} />
      </span>
    </span>
  );
}

export function BlBuilder({
  ready,
  operations,
  savedNotes,
  dispatched,
  assistantEnabled = false,
}: {
  ready: BoardParcel[];
  operations: BoardBlOperation[];
  savedNotes: BoardNote[];
  dispatched: BoardDispatchedOrder[];
  assistantEnabled?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  useAssistantSelection("shipment-selection", { selectedParcelIds: [...selected].slice(0, 10), selectionCount: selected.size });

  const selectedReady = ready.filter((parcel) => selected.has(parcel.submissionId));
  const allSelected = ready.length > 0 && selectedReady.length === ready.length;

  function toggle(submissionId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ready.map((p) => p.submissionId)));
  }

  // The server durably claims the selection, even when the HTTP result is lost.
  async function createOrResume(submissionIds: string[], pendingKey: string, label: string) {
    if (submissionIds.length === 0) {
      toast.error("Sélectionnez d'abord les colis à rattacher à ce BL.");
      return;
    }
    setPending(pendingKey);
    try {
      const { status, data } = await postJson("/api/crm/bl", { submissionIds });
      const error = await readError(data);
      if (status === 0 || (status >= 400 && !error)) {
        toast.error("Résultat inconnu. Actualisez les expéditions avant toute nouvelle action.");
        router.refresh();
        return;
      }
      if (status >= 400) {
        toast.error(error);
        router.refresh();
        return;
      }
      const bl = data?.bl as { ref?: string; status?: string } | undefined;
      toast.success(
        bl?.status === "saved"
          ? `${label} — BL ${bl.ref ?? ""} enregistré. Téléchargez les PDF.`
          : `${label} — BL ${bl?.ref ?? ""} en brouillon.`,
      );
      setSelected(new Set());
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function handoffParcel(submissionId: string) {
    setPending(`parcel:${submissionId}`);
    try {
      const { status, data } = await postJson(
        `/api/crm/parcels/${submissionId}/handoff`,
        { parcelId: submissionId },
      );
      const error = await readError(data);
      if (status === 0 || (status >= 400 && !error)) {
        toast.error("Remise au livreur impossible, réessayez.");
        return;
      }
      if (status >= 400) {
        toast.error(error);
        return;
      }
      toast.success(
        data?.alreadyDispatched
          ? "Colis déjà remis au livreur — aucun double débit."
          : "Colis remis au livreur — stock décrémenté.",
      );
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function handoffBl(note: BoardNote) {
    setPending(`bl:${note.id}`);
    try {
      const { status, data } = await postJson(`/api/crm/bl/${note.id}/handoff`);
      const error = await readError(data);
      if (status === 0 || (status >= 400 && !error)) {
        toast.error("Remise au livreur impossible, réessayez.");
        return;
      }
      if (status >= 400) {
        toast.error(error);
        return;
      }
      const results = (data?.results ?? []) as Array<{ ok?: boolean; error?: string }>;
      const failures = results.filter((result) => result.ok === false);
      if (failures.length === 0) {
        toast.success(
          `${results.length} colis remis au livreur — stock décrémenté.`,
        );
      } else {
        toast.error(
          `${failures.length} échec(s) de remise : ${failures
            .map((failure) => failure.error)
            .filter(Boolean)
            .join(" · ")}`,
        );
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex items-start gap-3 rounded-xl border border-[var(--crm-warning)]/40 bg-[var(--crm-warning-bg)] px-4 py-3 text-sm text-[var(--crm-warning)]">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          L&apos;enregistrement du BL ne signifie pas que le colis est remis au
          transporteur. La remise au livreur se fait par colis ou par BL, et
          décrémente alors le stock.
        </p>
      </div>

      <Section id="ready" title="Prêts pour BL" count={ready.length} icon={<TruckIcon className="size-4 text-muted-foreground" aria-hidden />}>
        {ready.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Aucun colis prêt pour un BL — les commandes confirmées apparaissent
            ici une fois transmises au transporteur.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {ready.map((parcel) => {
                const isSelected = selected.has(parcel.submissionId);
                return (
                  <li
                    key={parcel.submissionId}
                    onClick={() => toggle(parcel.submissionId)}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-foreground/20",
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(parcel.submissionId)}
                      onClick={(event) => event.stopPropagation()}
                      disabled={!parcel.trackingNumber}
                      aria-label={`Sélectionner la commande ${parcel.orderId}`}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <ParcelFacts parcel={parcel} />
                      </div>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {parcel.itemsSummary}
                      </p>
                      <TrackingCell tracking={parcel.trackingNumber} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Tout sélectionner"
                />
                Tout sélectionner
              </label>
              <Button
                onClick={() =>
                  createOrResume(
                    selectedReady.map((parcel) => parcel.submissionId),
                    "create",
                    "BL créé",
                  )
                }
                disabled={selectedReady.length === 0 || pending === "create"}
              >
                <TruckIcon aria-hidden />
                {pending === "create"
                  ? "Création…"
                  : `Créer le BL (${selectedReady.length})`}
              </Button>
              <p className="text-xs text-muted-foreground">
                Le BL est créé chez le transporteur, rempli avec les colis
                sélectionnés puis enregistré.
              </p>
            </div>
          </>
        )}
      </Section>

      <Section id="bl-operations" title="BL en cours — reprise et résolution" count={operations.length}>
        {operations.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Aucune opération BL en attente.
          </p>
        ) : (
          <ul className="space-y-3">
            {operations.map(operation => (
              <BlOperationCard key={`${operation.id}:${operation.revision}`} operation={operation} selectedReady={selectedReady} onExplain={assistantEnabled ? () => explainWithAssistant(operation.id) : undefined} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="saved-notes"
        title="BL enregistrés — à remettre au livreur"
        count={savedNotes.length}
        icon={<PackageCheckIcon className="size-4 text-muted-foreground" aria-hidden />}
      >
        {savedNotes.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Aucun BL enregistré en attente de remise.
          </p>
        ) : (
          <ul className="space-y-3">
            {savedNotes.map((note) => (
              <li key={note.id} className="rounded-xl border border-[var(--crm-success)]/30 bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{note.ref}</span>
                  <span className="rounded-full border border-[var(--crm-success)]/40 bg-[var(--crm-success-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--crm-success)]">
                    Enregistré
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    Enregistré le {note.savedAtLabel ?? note.createdAtLabel}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {note.parcels.map((parcel) => (
                    <li
                      key={parcel.submissionId}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2"
                    >
                      <ParcelFacts parcel={parcel} />
                      <TrackingCell tracking={parcel.trackingNumber} />
                      <span className="ml-auto">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handoffParcel(parcel.submissionId)}
                          disabled={pending === `parcel:${parcel.submissionId}`}
                        >
                          <HandIcon aria-hidden />
                          Remis au livreur
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  <Button
                    size="sm"
                    onClick={() => handoffBl(note)}
                    disabled={pending === `bl:${note.id}`}
                  >
                    <HandIcon aria-hidden />
                    {pending === `bl:${note.id}`
                      ? "Remise…"
                      : `Remis au livreur — BL entier (${note.parcels.length})`}
                  </Button>
                  <BlPrintActions noteId={note.id} refCode={note.ref} />
                  {assistantEnabled && <Button type="button" size="sm" variant="outline" onClick={() => explainWithAssistant(note.id)}>Expliquer ce BL avec Z-800</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="dispatched" title="Remis au livreur" count={dispatched.length} initiallyOpen={false} icon={<HandIcon className="size-4 text-muted-foreground" aria-hidden />}>
        {dispatched.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Aucune remise au livreur sur les 14 derniers jours.
          </p>
        ) : (
          <ul className="space-y-2">
            {dispatched.map((entry) => (
              <li
                key={entry.orderId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-4 py-3"
              >
                <span className="font-mono text-xs text-primary">{entry.orderId}</span>
                <span className="text-sm font-medium text-foreground">{entry.customerName}</span>
                {entry.cityName ? (
                  <span className="text-xs text-muted-foreground">{entry.cityName}</span>
                ) : null}
                <span className="ml-auto text-sm font-semibold text-foreground">
                  {formatMad(entry.total)}
                </span>
                <span className="text-xs text-muted-foreground">{entry.actor}</span>
                <span className="text-xs text-muted-foreground">
                  {entry.dispatchedAtLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
