"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CancelOrder({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  async function cancel() {
    if (busy.current || !reason.trim()) return;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch(`/api/crm/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error ?? "Erreur lors de l'annulation.");
        return;
      }
      toast.success("Commande annulée — stock libéré.");
      router.refresh();
    } catch {
      toast.error("Erreur lors de l'annulation.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className="mt-4 space-y-2 border-t border-border pt-4">
      <Input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        aria-label="Motif d'annulation"
        placeholder="Motif d'annulation…"
        maxLength={2000}
        disabled={pending}
        className="border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring"
      />
      <Button variant="destructive" size="sm" onClick={cancel} disabled={pending || !reason.trim()}>
        {pending ? "Annulation…" : "Annuler la commande"}
      </Button>
    </div>
  );
}
