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

export function BlockPhoneButton({ phone }: { phone: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  function close() {
    if (pending) return;
    setOpen(false);
    setReason("");
  }

  async function submit() {
    if (busy.current || !reason.trim()) return;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/crm/blocklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, reason: reason.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error ?? "Erreur lors du blocage.");
        return;
      }
      toast.success("Numéro bloqué.");
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      toast.error("Erreur lors du blocage.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Bloquer ce numéro
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquer ce numéro</DialogTitle>
            <DialogDescription>
              Les futures commandes restent acceptées mais seront signalées aux agents. Seul un admin peut débloquer.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-label="Motif du blocage"
            placeholder="Motif (ex : refus répétés)…"
            maxLength={500}
            disabled={pending}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={submit} disabled={pending || !reason.trim()}>
              {pending ? "Enregistrement…" : "Bloquer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
