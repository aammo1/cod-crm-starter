"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Outcome = "delivered" | "refused";

const LABELS: Record<Outcome, string> = { delivered: "livré", refused: "refusé" };

export function DeliveryOutcomeActions({
  orderId,
  current,
  isAdmin,
}: {
  orderId: string;
  current: Outcome | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<Outcome | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  const needsReason = current !== null;
  const options = (["delivered", "refused"] as const).filter((o) => o !== current);
  // Agents cannot change an existing outcome.
  if (current && !isAdmin) return null;

  function close() {
    if (pending) return;
    setTarget(null);
    setReason("");
  }

  async function submit() {
    if (!target || busy.current || (needsReason && !reason.trim())) return;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch(`/api/crm/orders/${orderId}/delivery-outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: target,
          ...(needsReason ? { reason: reason.trim() } : {}),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error ?? "Erreur lors de l'enregistrement.");
        return;
      }
      toast.success(`Commande marquée ${LABELS[target]}.`);
      setTarget(null);
      setReason("");
      router.refresh();
    } catch {
      toast.error("Erreur lors de l'enregistrement.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
      {options.map((outcome) => (
        <Button
          key={outcome}
          type="button"
          size="sm"
          variant={outcome === "refused" ? "destructive" : "default"}
          className="w-full sm:w-auto"
          onClick={() => setTarget(outcome)}
        >
          {outcome === "delivered" ? "Marquer livré" : "Marquer refusé"}
        </Button>
      ))}
      <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer : commande {target ? LABELS[target] : ""}</DialogTitle>
            <DialogDescription>
              {target === "refused"
                ? "Un retour sera créé pour ce colis. Le stock n'est modifié qu'à l'inspection du retour."
                : "La remise au livreur sera enregistrée si elle ne l'est pas déjà."}
            </DialogDescription>
          </DialogHeader>
          {needsReason ? (
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-label="Motif du changement"
              placeholder="Motif du changement…"
              maxLength={500}
              disabled={pending}
            />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Annuler
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending || (needsReason && !reason.trim())}
            >
              {pending ? "Enregistrement…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
