"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SelectionContext = createContext<{
  selected: Set<string>;
  ids: string[];
  pending: boolean;
  toggle: (ids: string[], checked: boolean) => void;
} | null>(null);

export function OrderSelection({ id }: { id?: string }) {
  const selection = useContext(SelectionContext);
  if (!selection) return null;
  const ids = id ? [id] : selection.ids;
  const count = ids.filter((value) => selection.selected.has(value)).length;
  return <Checkbox
    aria-label={id ? `Sélectionner la commande ${id}` : "Sélectionner toutes les commandes de cette page"}
    checked={count === ids.length && count > 0 ? true : count > 0 ? "indeterminate" : false}
    disabled={selection.pending || ids.length === 0}
    onCheckedChange={(checked) => selection.toggle(ids, checked === true)}
  />;
}

export function OrderBulkActions({ ids, archived, isAdmin, children }: {
  ids: string[];
  archived: boolean;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = useRef(false);
  const current = ids.filter((id) => selected.has(id));

  async function act(action: "archive" | "restore" | "delete") {
    if (busy.current || !current.length) return;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/crm/orders/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: current, action }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error ?? "Impossible de modifier les commandes.");
        return;
      }
      toast.success(`${data.count} commande(s) ${action === "archive" ? "archivée(s)" : action === "restore" ? "restaurée(s)" : "supprimée(s)"}.`);
      setSelected(new Set());
      setConfirmDelete(false);
      router.refresh();
    } catch {
      toast.error("Erreur réseau. Réessayez.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return <SelectionContext.Provider value={{
    selected, ids, pending,
    toggle: (values, checked) => setSelected((previous) => {
      const next = new Set(previous);
      for (const value of values) {
        if (checked) next.add(value);
        else next.delete(value);
      }
      return next;
    }),
  }}>
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
        <span className="mr-auto text-sm text-muted-foreground" role="status">
          {current.length ? `${current.length} sélectionnée(s) sur cette page` : "Sélectionnez des commandes pour les gérer en lot."}
        </span>
        <Button variant="outline" size="sm" disabled={pending || !current.length} onClick={() => act(archived ? "restore" : "archive")}>
          {archived ? <ArchiveRestoreIcon data-icon="inline-start" /> : <ArchiveIcon data-icon="inline-start" />}
          {pending ? "Traitement…" : archived ? "Restaurer" : "Archiver"}
        </Button>
        {archived && isAdmin ? <Button variant="destructive" size="sm" disabled={pending || !current.length} onClick={() => setConfirmDelete(true)}>
          <Trash2Icon data-icon="inline-start" /> Supprimer définitivement
        </Button> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {archived ? "Les archives restent consultables. La suppression est réservée aux commandes sans historique de stock ou d’expédition." : "Archiver masque les commandes de cette liste. Le stock, les expéditions et les statistiques restent inchangés."}
      </p>
      {children}
    </div>
    <Dialog open={confirmDelete} onOpenChange={(open) => { if (!pending) setConfirmDelete(open); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Supprimer {current.length} commande(s) ?</DialogTitle>
          <DialogDescription>
            Cette suppression est définitive : les commandes sélectionnées et leurs notes de contact seront effacées.
            Si une commande possède un historique de stock ou d’expédition, aucune commande de la sélection ne sera supprimée.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setConfirmDelete(false)}>Conserver</Button>
          <Button variant="destructive" disabled={pending || !current.length} onClick={() => act("delete")}>
            {pending ? "Suppression…" : "Supprimer définitivement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </SelectionContext.Provider>;
}
