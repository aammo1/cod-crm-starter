"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheckIcon, ScanSearchIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const fieldClassName =
  "w-full border-input bg-background text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-ring/20";

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

export function ReceiveReturnButton({ returnId }: { returnId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function onReceive() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/crm/returns/${returnId}/receive`, {
        method: "POST",
      });
      if (!response.ok) {
        toast.error(await readError(response, "Erreur lors de la réception du colis."));
        return;
      }
      toast.success("Colis marqué reçu — passez à l'inspection.");
      router.refresh();
    } catch {
      toast.error("Erreur lors de la réception du colis.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Button type="button" size="sm" onClick={onReceive} disabled={busy}>
      <PackageCheckIcon aria-hidden />
      {busy ? "Réception…" : "Colis reçu"}
    </Button>
  );
}

export interface InspectLine {
  lineIndex: number;
  name: string;
  color: string;
  size: string;
  quantity: number;
  /** True for an accepted-upsell line (paire bonus). */
  upsell: boolean;
  /** False when the line's variant was not dispatched (cannot be restocked). */
  inspectable: boolean;
}

interface SplitInput {
  sellable: string;
  damaged: string;
}

function UpsellBadge() {
  return (
    <span className="ml-2 inline-flex shrink-0 items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-primary">
      Paire bonus
    </span>
  );
}

function lockedLineNote(): string {
  return "Cette variante ne figure pas parmi les paires expédiées — inspection manuelle requise.";
}

export function ReturnInspectForm({
  returnId,
  lines,
}: {
  returnId: string;
  lines: InspectLine[];
}) {
  const router = useRouter();
  const [splits, setSplits] = useState<Record<number, SplitInput>>(() =>
    Object.fromEntries(
      lines.map((line) => [line.lineIndex, { sellable: "", damaged: "" }]),
    ),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const reasonOk = reason.trim().length > 0;
  const anyInspectable = lines.some((line) => line.inspectable);

  function update(lineIndex: number, field: keyof SplitInput, value: string) {
    setSplits((previous) => ({
      ...previous,
      [lineIndex]: { ...previous[lineIndex], [field]: value },
    }));
  }

  async function onInspect() {
    if (busyRef.current) return;
    if (!reasonOk) {
      toast.error("Veuillez indiquer le motif du retour.");
      return;
    }
    const payloadLines: Array<{ lineIndex: number; sellable: number; damaged: number }> = [];
    for (const line of lines) {
      // Lines whose variant was never dispatched cannot be credited —
      // never submit quantities for them.
      if (!line.inspectable) continue;
      const entry = splits[line.lineIndex] ?? { sellable: "", damaged: "" };
      const s = Number(entry.sellable);
      const d = Number(entry.damaged);
      if (!Number.isSafeInteger(s) || !Number.isSafeInteger(d) || s < 0 || d < 0) {
        toast.error(`${line.name} : saisissez des quantités entières positives ou nulles.`);
        return;
      }
      if (s + d > line.quantity) {
        toast.error(
          `${line.name} : ${s + d} paire(s) déclarée(s) pour ${line.quantity} commandée(s).`,
        );
        return;
      }
      if (s > 0 || d > 0) {
        payloadLines.push({ lineIndex: line.lineIndex, sellable: s, damaged: d });
      }
    }
    if (payloadLines.length === 0) {
      toast.error("Indiquez au moins une paire vendable ou endommagée.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/crm/returns/${returnId}/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: payloadLines,
          reason: reason.trim(),
        }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Erreur lors de l'inspection."));
        return;
      }
      toast.success("Inspection enregistrée — stock mis à jour.");
      router.refresh();
    } catch {
      toast.error("Erreur lors de l'inspection.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Comptez les paires reçues : les paires vendables retournent en stock, les
        paires endommagées partent en quarantaine.
      </p>
      <ul className="space-y-3">
        {lines.map((line) => {
          const entry = splits[line.lineIndex] ?? { sellable: "", damaged: "" };
          const declared =
            (Number(entry.sellable) || 0) +
            (Number(entry.damaged) || 0);
          const over = declared > line.quantity;
          if (!line.inspectable) {
            return (
              <li
                key={line.lineIndex}
                className="rounded-lg border border-border bg-muted/20 p-3 opacity-60"
              >
                <p className="text-sm font-medium text-foreground">
                  {line.name}
                  <span className="text-muted-foreground">
                    {" "}
                    ×{line.quantity} ({line.color} / {line.size})
                  </span>
                  {line.upsell ? <UpsellBadge /> : null}
                </p>
                <p className="mt-1.5 text-xs text-[var(--crm-warning)]">
                  {lockedLineNote()}
                </p>
              </li>
            );
          }
          return (
            <li
              key={line.lineIndex}
              className="rounded-lg border border-border bg-muted/20 p-3"
            >
              <p className="text-sm font-medium text-foreground">
                {line.name}
                <span className="text-muted-foreground">
                  {" "}
                  ×{line.quantity} ({line.color} / {line.size})
                </span>
                {line.upsell ? <UpsellBadge /> : null}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor={`sellable-${returnId}-${line.lineIndex}`}
                    className="text-xs text-[var(--crm-success)]"
                  >
                    Vendables
                  </Label>
                  <Input
                    id={`sellable-${returnId}-${line.lineIndex}`}
                    type="number"
                    min={0}
                    max={line.quantity}
                    inputMode="numeric"
                    value={entry.sellable}
                    onChange={(event) =>
                      update(line.lineIndex, "sellable", event.target.value)
                    }
                    aria-invalid={over || undefined}
                    className={`${fieldClassName} ${over ? "border-destructive" : ""}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor={`damaged-${returnId}-${line.lineIndex}`}
                    className="text-xs text-[var(--crm-warning)]"
                  >
                    Endommagées
                  </Label>
                  <Input
                    id={`damaged-${returnId}-${line.lineIndex}`}
                    type="number"
                    min={0}
                    max={line.quantity}
                    inputMode="numeric"
                    value={entry.damaged}
                    onChange={(event) =>
                      update(line.lineIndex, "damaged", event.target.value)
                    }
                    aria-invalid={over || undefined}
                    className={`${fieldClassName} ${over ? "border-destructive" : ""}`}
                  />
                </div>
              </div>
              {over ? (
                <p className="mt-1.5 text-xs text-[var(--crm-danger)]">
                  Total déclaré supérieur aux {line.quantity} paire(s) commandée(s).
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="space-y-1.5">
        <Label htmlFor={`reason-${returnId}`} className="text-foreground">
          Motif du retour <span className="text-muted-foreground">(obligatoire)</span>
        </Label>
        <Textarea
          id={`reason-${returnId}`}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          placeholder="Ex. pointure non conforme, abîmé transport…"
          aria-required="true"
          className={fieldClassName}
        />
        {!reasonOk ? (
          <p className="text-xs text-[var(--crm-warning)]">
            Le motif est obligatoire pour valider l&apos;inspection.
          </p>
        ) : null}
      </div>
      {!anyInspectable ? (
        <p className="text-xs text-[var(--crm-danger)]">
          Aucune paire réintégrable automatiquement pour ce retour — inspection
          manuelle requise.
        </p>
      ) : null}
      <div className="flex justify-end border-t border-border pt-3">
        <Button
          type="button"
          size="sm"
          onClick={onInspect}
          disabled={busy || !reasonOk || !anyInspectable}
        >
          <ScanSearchIcon aria-hidden />
          {busy ? "Inspection…" : "Valider l'inspection"}
        </Button>
      </div>
    </div>
  );
}
