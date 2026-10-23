"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductPack } from "@/lib/commerce-types";
import styles from "./catalog-form.module.css";

interface Row { key: string; quantity: string; price: string; label: string; highlight: boolean }
const toRow = (p: { quantity: number; price: number; label?: string; highlight?: boolean }): Row => ({
  key: crypto.randomUUID(), quantity: String(p.quantity), price: String(p.price), label: p.label ?? "", highlight: !!p.highlight,
});

export function PacksEditor({ productId, basePrice, initialPacks, initialLandingEnabled, productSlug }: {
  productId: string; basePrice: number; initialPacks: ProductPack[]; initialLandingEnabled: boolean; productSlug: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => initialPacks.map(toRow));
  const [landing, setLanding] = useState(initialLandingEnabled);
  const [pending, setPending] = useState(false);
  const patch = (key: string, values: Partial<Row>) => setRows(rows.map(r => r.key === key ? { ...r, ...values } : r));
  const setHighlight = (key: string, on: boolean) => setRows(rows.map(r => ({ ...r, highlight: r.key === key ? on : false })));

  async function save() {
    if (pending) return;
    setPending(true);
    try {
      const packs = rows.map(r => ({
        quantity: Number(r.quantity), price: Number(r.price),
        ...(r.label.trim() ? { label: r.label.trim() } : {}), highlight: r.highlight,
      }));
      const res = await fetch(`/api/admin/products/${productId}/packs`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ landingEnabled: landing, packs }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Enregistrement impossible.");
      setRows((body.packs as ProductPack[]).map(toRow));
      setLanding(!!body.landingEnabled);
      toast.success("Packs enregistrés");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return <section className={`${styles.form} space-y-5 rounded-xl border border-border p-4 md:p-6`}>
    <div>
      <h2 className="font-display text-lg font-semibold">Packs &amp; page de vente</h2>
      <p className="mt-1 text-sm text-muted-foreground">Proposez des prix dégressifs (jusqu’à 4 packs, de 2 à 10 pièces). Prix normal : {basePrice} DH l’unité.</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Checkbox id="landing-enabled" checked={landing} onCheckedChange={v => setLanding(v === true)} />
      <Label htmlFor="landing-enabled">Activer la page de vente /l/{productSlug}</Label>
      {landing && <a href={`/l/${productSlug}`} target="_blank" rel="noopener noreferrer" className="text-sm underline">Ouvrir la page</a>}
    </div>
    <div className="space-y-3">
      {rows.map((row, index) => {
        const q = Number(row.quantity); const p = Number(row.price);
        const normal = q * basePrice;
        const bad = Number.isFinite(q) && Number.isFinite(p) && row.price !== "" && p >= normal;
        return <article key={row.key} className="min-w-0 space-y-3 rounded-lg border border-border p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor={`pack-q-${row.key}`}>Quantité</Label><Input id={`pack-q-${row.key}`} type="number" inputMode="numeric" min={2} max={10} step={1} value={row.quantity} onChange={e => patch(row.key, { quantity: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor={`pack-p-${row.key}`}>Prix du pack (DH)</Label><Input id={`pack-p-${row.key}`} type="number" inputMode="numeric" min={1} step={1} value={row.price} onChange={e => patch(row.key, { price: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor={`pack-l-${row.key}`}>Libellé</Label><Input id={`pack-l-${row.key}`} maxLength={60} placeholder="Ex. Le plus populaire" value={row.label} onChange={e => patch(row.key, { label: e.target.value })} /></div>
          </div>
          <p className={`text-xs ${bad ? "text-destructive" : "text-muted-foreground"}`}>Prix normal : {normal} DH · Économie : {normal - p} DH</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Checkbox id={`pack-h-${row.key}`} checked={row.highlight} onCheckedChange={v => setHighlight(row.key, v === true)} /><Label htmlFor={`pack-h-${row.key}`}>Mettre en avant</Label></div>
            <Button type="button" variant="ghost" aria-label={`Supprimer le pack ${index + 1}`} onClick={() => setRows(rows.filter(r => r.key !== row.key))}>Supprimer</Button>
          </div>
        </article>;
      })}
      {!rows.length && <p className="text-sm text-muted-foreground">Aucun pack pour ce produit.</p>}
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={rows.length >= 4 || pending} onClick={() => setRows([...rows, toRow({ quantity: 2, price: 0 })].map((r, i, a) => i === a.length - 1 ? { ...r, price: "" } : r))}>Ajouter un pack</Button>
      <Button type="button" disabled={pending} onClick={save}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
    </div>
  </section>;
}
