"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CheckoutLead } from "@/lib/services/checkout-leads";

const dateTime = new Intl.DateTimeFormat("fr-MA", { timeZone: "Africa/Casablanca", dateStyle: "short", timeStyle: "short" });

export function LeadsWorkspace({ initialLeads, retentionDays }: { initialLeads: CheckoutLead[]; retentionDays: number }) {
  const [leads, setLeads] = useState(initialLeads);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, action: "dismiss" | "contacted") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(data?.error ?? "Action impossible.");
        return;
      }
      setLeads((all) => action === "dismiss"
        ? all.filter((l) => l.id !== id)
        : all.map((l) => (l.id === id ? { ...l, status: "contacted" } : l)));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold text-2xl text-foreground">Paniers abandonnés</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visiteurs qui ont saisi leur numéro sans commander. Appelez-les, puis créez la commande ou ignorez le panier.
          Les paniers non traités sont supprimés après {retentionDays} jours.
        </p>
      </div>
      {leads.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">Aucun panier abandonné.</p>
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => (
            <li key={lead.id} className="space-y-2 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">{lead.name}</p>
                <span className="text-xs text-muted-foreground">
                  {dateTime.format(new Date(lead.updatedAt))}{lead.status === "contacted" ? " · Contacté" : ""}
                </span>
              </div>
              <p className="text-sm tabular-nums" dir="ltr">{lead.phone}</p>
              <ul className="text-sm text-muted-foreground">
                {lead.items.map((i) => <li key={i.variantId}>{i.qty} × {i.label}</li>)}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="min-h-11">
                  <a href={`tel:${encodeURIComponent(lead.phone)}`}>Appeler</a>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <a href={`https://wa.me/${encodeURIComponent(lead.phone.replace(/^\+/, ""))}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </Button>
                <Button asChild className="min-h-11">
                  <Link href={`/crm/orders/new?leadId=${encodeURIComponent(lead.id)}`}>Créer la commande</Link>
                </Button>
                {lead.status === "open" && (
                  <Button variant="outline" className="min-h-11" disabled={busyId === lead.id} onClick={() => void act(lead.id, "contacted")}>
                    Marquer contacté
                  </Button>
                )}
                <Button variant="ghost" className="min-h-11" disabled={busyId === lead.id} onClick={() => void act(lead.id, "dismiss")}>
                  Ignorer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
