"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AD_CHANNELS,
  AD_CHANNEL_LABELS,
  type AdChannel,
} from "@/lib/ad-spend-schemas";
import type { AdSpendEntry, AdSpendTotal } from "@/lib/services/ad-spend";

const fieldClassName =
  "w-full border-input bg-background text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-ring/20";
const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20";

const mad = new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 0 });
const formatMad = (n: number) => `${mad.format(n)} MAD`;
const dayLabel = (d: string) => d.split("-").reverse().join("/");

export function AdSpendWorkspace({
  initialEntries,
  initialTotals,
  initialFrom,
  initialTo,
  today,
}: {
  initialEntries: AdSpendEntry[];
  initialTotals: AdSpendTotal[];
  initialFrom: string;
  initialTo: string;
  today: string;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [totals, setTotals] = useState(initialTotals);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [loading, setLoading] = useState(false);

  const [day, setDay] = useState(today);
  const [channel, setChannel] = useState<AdChannel>("meta");
  const [campaign, setCampaign] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load(nextFrom = from, nextTo = to) {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/crm/ad-spend?from=${encodeURIComponent(nextFrom)}&to=${encodeURIComponent(nextTo)}`,
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        entries?: AdSpendEntry[];
        totals?: AdSpendTotal[];
      } | null;
      if (!res.ok || !data?.entries) {
        toast.error(data?.error ?? "Impossible de charger les dépenses.");
        return;
      }
      setEntries(data.entries);
      setTotals(data.totals ?? []);
    } catch {
      toast.error("Erreur de connexion. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const value = amount.trim();
    if (!/^\d+$/.test(value)) {
      toast.error("Le montant doit être un entier en MAD.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/crm/ad-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day,
          channel,
          campaign: campaign.trim(),
          amount: Number(value),
          note: note.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(data?.error ?? "Impossible d'enregistrer la dépense.");
        return;
      }
      toast.success("Dépense enregistrée.");
      setAmount("");
      setNote("");
      await load();
    } catch {
      toast.error("Erreur de connexion. Veuillez réessayer.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: AdSpendEntry) {
    if (deletingId) return;
    if (!window.confirm(`Supprimer la dépense du ${dayLabel(entry.day)} (${AD_CHANNEL_LABELS[entry.channel]}) ?`)) return;
    setDeletingId(entry.id);
    try {
      const res = await fetch(`/api/crm/ad-spend/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(data?.error ?? "Impossible de supprimer la dépense.");
        return;
      }
      toast.success("Dépense supprimée.");
      await load();
    } catch {
      toast.error("Erreur de connexion. Veuillez réessayer.");
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(entry: AdSpendEntry) {
    setDay(entry.day);
    setChannel(entry.channel);
    setCampaign(entry.campaign);
    setAmount(String(entry.amount));
    setNote(entry.note ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const grandTotal = totals.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-bold text-foreground">Dépenses pub</h1>
        <p className="text-sm text-muted-foreground">
          Saisissez les dépenses publicitaires par jour, canal et campagne.
        </p>
      </header>

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="ad-day">Date</Label>
            <Input id="ad-day" type="date" required value={day} onChange={(e) => setDay(e.target.value)} className={fieldClassName} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-channel">Canal</Label>
            <select id="ad-channel" value={channel} onChange={(e) => setChannel(e.target.value as AdChannel)} className={selectClassName}>
              {AD_CHANNELS.map((c) => (
                <option key={c} value={c}>{AD_CHANNEL_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-campaign">Campagne (utm_campaign, optionnel)</Label>
            <Input id="ad-campaign" maxLength={200} value={campaign} onChange={(e) => setCampaign(e.target.value)} className={fieldClassName} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-amount">Montant (MAD)</Label>
            <Input id="ad-amount" inputMode="numeric" required value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldClassName} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Montant en MAD (convertissez si votre compte est en USD).
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="ad-note">Note (optionnel)</Label>
          <Input id="ad-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={fieldClassName} />
        </div>
        <Button type="submit" disabled={saving} className="min-h-[44px] w-full sm:w-auto">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ad-from">Du</Label>
            <Input id="ad-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClassName} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-to">Au</Label>
            <Input id="ad-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClassName} />
          </div>
          <Button type="button" variant="outline" disabled={loading || !from || !to} onClick={() => load()} className="min-h-[44px]">
            {loading ? "Chargement..." : "Filtrer"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg bg-muted px-3 py-1.5 font-semibold text-foreground">
            Total : {formatMad(grandTotal)}
          </span>
          {totals.map((t) => (
            <span key={t.key} className="rounded-lg bg-muted px-3 py-1.5 text-muted-foreground">
              {AD_CHANNEL_LABELS[t.key as AdChannel] ?? t.key} : {formatMad(t.amount)}
            </span>
          ))}
        </div>

        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Aucune dépense sur cette période.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    {dayLabel(entry.day)} · {AD_CHANNEL_LABELS[entry.channel]}
                    {entry.campaign ? <span className="font-normal text-muted-foreground"> · {entry.campaign}</span> : null}
                  </p>
                  {entry.note ? <p className="break-words text-xs text-muted-foreground">{entry.note}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{formatMad(entry.amount)}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => startEdit(entry)} aria-label="Modifier la dépense" className="min-h-[44px] min-w-[44px]">
                    <PencilIcon className="size-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={deletingId === entry.id} onClick={() => handleDelete(entry)} aria-label="Supprimer la dépense" className="min-h-[44px] min-w-[44px]">
                    <Trash2Icon className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
