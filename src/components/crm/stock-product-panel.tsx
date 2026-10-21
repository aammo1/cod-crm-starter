"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { QuantitiesGrid } from "@/components/admin/quantities-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { StockVariantRow } from "@/components/crm/stock-tables";
import { useAssistantSelection } from "@/stores/assistant-context";

type Mode = "opening" | "receive" | "count";
const ACTIONS: Record<Mode, string> = { opening: "Stock initial", receive: "Ajouter du stock", count: "Corriger le stock" };

export function StockProductPanel({ rows, isAdmin }: { rows: StockVariantRow[]; isAdmin: boolean }) {
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  useAssistantSelection("stock-product", productId ? { productId } : {});
  const products = useMemo(() => [...new Map(rows.map((row) => [row.productId, { id: row.productId, name: row.productName }])).values()], [rows]);
  const matches = products.filter((product) => {
    const needle = search.trim().toLocaleLowerCase("fr");
    return product.name.toLocaleLowerCase("fr").includes(needle) || rows.some((row) => row.productId === product.id && row.sku.toLowerCase().includes(needle));
  });
  const selected = rows.filter((row) => row.productId === productId);
  const [locked, setLocked] = useState(false);
  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Stock par produit</h2>
        <p className="mt-1 text-sm text-muted-foreground">Toutes les couleurs et pointures, en un seul enregistrement.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="stock-search">Rechercher un produit</Label>
          <Input id="stock-search" type="search" placeholder="Nom du produit ou SKU…" value={search} onChange={(event) => setSearch(event.target.value)} disabled={locked} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stock-product">Produit ({matches.length})</Label>
          <Select value={productId} onValueChange={setProductId} disabled={locked}>
            <SelectTrigger id="stock-product" className="w-full"><SelectValue placeholder="Choisir un produit…" /></SelectTrigger>
            <SelectContent>
              {matches.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {product.id}</SelectItem>)}
              {!matches.length && <p className="p-3 text-sm text-muted-foreground">Aucun produit trouvé.</p>}
            </SelectContent>
          </Select>
        </div>
      </div>
      {selected.length ? <ProductQuantities key={productId} rows={selected} isAdmin={isAdmin} onLock={setLocked} /> : <p className="py-6 text-center text-sm text-muted-foreground">Sélectionnez un produit pour consulter ses quantités{isAdmin ? " et gérer son stock" : ""}.</p>}
    </section>
  );
}

function ProductQuantities({ rows, isAdmin, onLock }: { rows: StockVariantRow[]; isAdmin: boolean; onLock: (locked: boolean) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("receive");
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busyRef = useRef(false);
  const request = useRef<{ payload: string; id: string; body: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [conflictRefreshed, setConflictRefreshed] = useState(false);
  const [message, setMessage] = useState("");
  const [snapshot, setSnapshot] = useState(rows);
  const locked = busy || refreshing || uncertain;
  const eligible = rows.filter((row) => mode !== "opening" || row.canOpen);
  const entered = eligible.filter((row) => (values[row.variantId] ?? "").trim() !== "");
  const total = entered.reduce((sum, row) => sum + (Number(values[row.variantId]) || 0), 0);
  const displayedValues = isAdmin ? values : Object.fromEntries(rows.map((row) => [row.variantId, String(row.physical)]));
  const refresh = () => startRefresh(() => router.refresh());

  async function save() {
    if (busyRef.current || refreshing || conflict) return;
    let body: string;
    if (uncertain && request.current) {
      body = request.current.body;
    } else {
      const items = [];
      for (const row of entered) {
        const raw = values[row.variantId].trim();
        const qty = Number(raw);
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(qty) || qty < (mode === "receive" ? 1 : 0)) {
          setMessage(`Quantité invalide : ${row.colorName}, pointure ${row.size}. ${mode === "receive" ? "Saisissez un entier supérieur à zéro." : "Saisissez un entier positif ou nul."}`);
          return;
        }
        const expected = snapshot.find((item) => item.variantId === row.variantId);
        if (mode === "count" && !expected) {
          setConflict(true);
          setConflictRefreshed(false);
          setMessage("Les variantes du produit ont changé depuis le début de la saisie. Actualisez les soldes, vérifiez vos quantités puis réessayez.");
          return;
        }
        items.push({ variantId: row.variantId, qty, ...(mode === "count" && expected ? { expected: { physical: expected.physical, reserved: expected.reserved, quarantine: expected.quarantine } } : {}) });
      }
      if (!items.length || (mode === "count" && !reason.trim())) {
        setMessage("Saisissez au moins une quantité et le motif obligatoire pour une correction.");
        return;
      }
      const payload = JSON.stringify({ mode, ...(reason.trim() ? { reason: reason.trim() } : {}), items });
      if (request.current?.payload !== payload) {
        const id = crypto.randomUUID();
        request.current = { payload, id, body: JSON.stringify({ requestId: id, ...JSON.parse(payload) }) };
      }
      body = request.current.body;
    }
    busyRef.current = true;
    setBusy(true);
    onLock(true);
    setMessage("");
    let keepLocked = false;
    try {
      const response = await fetch("/api/crm/stock/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (response.status >= 500) throw new Error("uncertain");
      const data = await response.json() as { error?: string; updated?: number };
      if (!response.ok) {
        setUncertain(false);
        setConflict(response.status === 409);
        setConflictRefreshed(false);
        setMessage(response.status === 409 ? `${data.error ?? "Le stock a changé."} Actualisez les soldes, vérifiez vos quantités puis réessayez.` : data.error ?? "Enregistrement refusé. Vérifiez la saisie.");
        return;
      }
      setUncertain(false);
      setValues({});
      setReason("");
      request.current = null;
      toast.success(`Stock enregistré — ${data.updated ?? entered.length} variante(s).`);
      refresh();
    } catch {
      keepLocked = true;
      setUncertain(true);
      setMessage("Résultat non confirmé. Réessayez le même enregistrement : son identifiant est conservé pour éviter tout doublon.");
    } finally {
      busyRef.current = false;
      setBusy(false);
      onLock(keepLocked);
    }
  }

  return (
    <div className="space-y-5">
      <h3 className="font-semibold">{rows[0].productName}</h3>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {([['Physique', rows.reduce((n, r) => n + r.physical, 0)], ['Réservé', rows.reduce((n, r) => n + r.reserved, 0)], ['Quarantaine', rows.reduce((n, r) => n + r.quarantine, 0)], ['Disponible', rows.reduce((n, r) => n + r.available, 0)], ['Variantes à stock bas (≤ 3)', rows.filter((r) => r.available <= 3).length]] as const).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-muted/30 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>
        ))}
      </dl>
      {isAdmin && <div className="flex flex-wrap gap-2" role="group" aria-label="Opération de stock">
        {(Object.keys(ACTIONS) as Mode[]).map((action) => <Button key={action} type="button" variant={mode === action ? "default" : "outline"} aria-pressed={mode === action} disabled={locked || conflict} onClick={() => { setMode(action); setValues({}); setReason(""); setSnapshot(rows); setMessage(""); setConflict(false); request.current = null; }}>{ACTIONS[action]}</Button>)}
      </div>}
      <p className="text-sm text-muted-foreground">{!isAdmin ? "Consultation uniquement." : mode === "receive" ? "Saisissez les quantités reçues à ajouter au stock physique (strictement supérieures à zéro)." : mode === "count" ? "Saisissez le total physique réellement présent en rayon, y compris les paires réservées et en quarantaine. Un seul motif pour toute la correction." : "Ouverture unique, réservée aux variantes sans aucun mouvement de stock."} {isAdmin && "Une case vide reste inchangée."} {isAdmin && mode !== "receive" && "Saisissez 0 pour déclarer explicitement un stock nul."}</p>
      <QuantitiesGrid values={displayedValues} onChange={(id, value) => { if (!entered.length) setSnapshot(rows); setValues((prev) => ({ ...prev, [id]: value })); setMessage(""); }} disabled={!isAdmin || locked || conflict} min={mode === "receive" ? 1 : 0} cells={rows.map((row) => ({ id: row.variantId, colorId: row.colorId, colorName: row.colorName, size: row.size, disabled: mode === "opening" && !row.canOpen, detail: <><span className="block">Phys. {row.physical} · Rés. {row.reserved} · Quar. {row.quarantine}</span><span className={row.available <= 3 ? "text-[var(--crm-warning)]" : ""}>Dispo. {row.available}{row.available <= 3 ? " · Stock bas" : ""}</span>{mode === "opening" && !row.canOpen && <span className="block">Déjà ouvert ou mouvementé</span>}</> }))} />
      {isAdmin && <>
        <div className="space-y-1.5"><Label htmlFor="batch-stock-reason">Motif {mode === "count" ? "(obligatoire)" : "(facultatif)"}</Label><Textarea id="batch-stock-reason" maxLength={500} value={reason} disabled={locked || conflict} onChange={(event) => setReason(event.target.value)} placeholder={mode === "count" ? "Ex. inventaire du dépôt, écart constaté…" : "Ex. réception fournisseur…"} /></div>
        {message && <p role="alert" className="rounded-lg border border-[var(--crm-warning)]/40 bg-[var(--crm-warning-bg)] p-3 text-sm text-[var(--crm-warning)]">{message}</p>}
        {conflict && <Button type="button" variant="outline" disabled={refreshing} onClick={() => { setConflictRefreshed(true); refresh(); }}>{refreshing ? "Actualisation…" : "Actualiser les soldes"}</Button>}
        {conflict && conflictRefreshed && !refreshing && <Button type="button" variant="outline" onClick={() => { setSnapshot(rows); request.current = null; setConflict(false); setMessage("Soldes repris. Vérifiez les quantités avant d’enregistrer."); }}>Reprendre avec les soldes affichés</Button>}
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{entered.length} variante(s) saisie(s) · {total} paire(s) {mode === "receive" ? "à ajouter" : "comptée(s)"}</p>
          <Button type="button" onClick={save} disabled={busy || refreshing || conflict || (!uncertain && (!entered.length || (mode === "count" && !reason.trim())))}>{busy ? "Enregistrement…" : refreshing ? "Actualisation…" : uncertain ? "Réessayer le même enregistrement" : "Enregistrer tout le produit"}</Button>
        </div>
      </>}
    </div>
  );
}
