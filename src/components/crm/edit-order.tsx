"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMad, shippingFor, type ShippingRules } from "@/lib/pricing";
import { applyPacks } from "@/lib/pack-pricing";
import { orderEditSchema, type DiscountMode, type DiscountType, type ShippingMode } from "@/lib/order-edit-schema";
import type { CityFeeProposal, OrderEditSnapshot } from "@/lib/services/order-edits";
import type { ProductPack, VariantOption } from "@/lib/commerce-types";

interface Option {
  variantId: string; productId: string; name: string; sku: string; label: string; options: VariantOption[]; price: number; available: number; packs?: ProductPack[];
}

function optionDescription(variant: Option): string {
  return `${variant.name} · ${variant.label}${variant.options.length ? ` · ${variant.options.map((option) => `${option.name} : ${option.value}`).join(" / ")}` : ""} · SKU ${variant.sku}`;
}
interface Line {
  key: number; variantId: string; qty: number; productId: string; name: string; upsellIndex?: number; upsellPrice?: number;
}

export function EditOrder({ orderId, revision, snapshot, options, shippingRules, cityFee, children }: {
  orderId: string; revision: string; snapshot: OrderEditSnapshot; options: Option[]; shippingRules: ShippingRules; cityFee?: CityFeeProposal | null; children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const nextKey = useRef(snapshot.items.length + snapshot.upsellItems.length);
  const initialLines = (): Line[] => [...snapshot.items, ...snapshot.upsellItems].map((item, index) => ({
    key: index, variantId: item.variant_id,
    qty: item.quantity, productId: item.product_id, name: item.name,
    ...(index >= snapshot.items.length ? { upsellIndex: index - snapshot.items.length, upsellPrice: item.unit_price } : {}),
  }));
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [discountMode, setDiscountMode] = useState<DiscountMode>(snapshot.discountMode ?? "manual");
  const [discountType, setDiscountType] = useState<DiscountType>(snapshot.discountType);
  const [discountValue, setDiscountValue] = useState(String(snapshot.discountValue));
  const [shippingMode, setShippingMode] = useState<ShippingMode>(snapshot.shippingMode);
  const [applyCityFee, setApplyCityFee] = useState(false);
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [addVariant, setAddVariant] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  // Untouched variants keep their quoted price; only new variants use the catalog price.
  const originalPrices = new Map(snapshot.items.map((item) => [item.variant_id, item.unit_price] as const));
  const unitPriceOf = (variantId: string) => originalPrices.get(variantId) ?? options.find((o) => o.variantId === variantId)?.price ?? 0;
  const regularSubtotal = lines.reduce((sum, line) => line.upsellIndex === undefined
    ? sum + unitPriceOf(line.variantId) * line.qty : sum, 0);
  const packsByProduct: Record<string, ProductPack[]> = {};
  for (const o of options) if (o.packs?.length) packsByProduct[o.productId] = o.packs;
  const packDiscount = applyPacks(lines.filter((l) => l.upsellIndex === undefined)
    .map((l) => ({ productId: options.find((o) => o.variantId === l.variantId)?.productId ?? l.productId, qty: l.qty, unitPrice: unitPriceOf(l.variantId) })),
    packsByProduct).discount;
  const upsellSubtotal = lines.reduce((sum, line) => sum + (line.upsellPrice ?? 0) * line.qty, 0);
  const discountAmount = discountMode === "pack" ? packDiscount : discountType === "percent" ? Math.round(regularSubtotal * Number(discountValue) / 100)
    : discountType === "fixed" ? Number(discountValue) : 0;
  const netSubtotal = Math.max(0, regularSubtotal + upsellSubtotal - (Number.isFinite(discountAmount) ? discountAmount : 0));
  // Preview of the explicit city fee override; the server re-reads the tariff and fixes the final amount.
  const proposeCityFee = !!cityFee && !cityFee.applied;
  const effectiveRules: ShippingRules = proposeCityFee && applyCityFee && cityFee
    ? { shippingFeeMad: cityFee.feeMad, freeShippingThresholdMad: cityFee.ignoresFreeThreshold ? Number.MAX_SAFE_INTEGER : cityFee.baseThresholdMad }
    : shippingRules;
  const shipping = shippingMode === "free" ? 0 : shippingMode === "paid" ? effectiveRules.shippingFeeMad : shippingFor(netSubtotal, effectiveRules);
  const totals = { discountAmount, shipping, total: netSubtotal + shipping };
  const filteredOptions = options.filter((v) => optionDescription(v).toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));

  function reset() {
    setLines(initialLines()); setDiscountMode(snapshot.discountMode ?? "manual"); setDiscountType(snapshot.discountType); setDiscountValue(String(snapshot.discountValue));
    setShippingMode(snapshot.shippingMode); setApplyCityFee(false); setReason(""); setQuery(""); setAddVariant(""); setError(""); setConflict(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const body = { revision, lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, upsellIndex: l.upsellIndex })),
      discountMode, discountType: discountMode === "pack" ? "none" : discountType,
      discountValue: discountMode === "pack" || discountType === "none" ? 0 : Number(discountValue), shippingMode,
      ...(proposeCityFee && applyCityFee ? { applyCityFee: true } : {}), reason };
    const parsed = orderEditSchema.safeParse(body);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Vérifiez les champs."); return; }
    if (totals.discountAmount > regularSubtotal) { setError("La remise dépasse le montant des articles hors upsell."); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const response = await fetch(`/api/crm/orders/${orderId}/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Impossible d'enregistrer la commande.");
        setConflict(response.status === 409);
        return;
      }
      toast.success("Commande modifiée — nouveau montant à encaisser enregistré.");
      setOpen(false);
      router.refresh();
    } catch { setError("Erreur de connexion. Réessayez ou rechargez la commande pour vérifier l'enregistrement."); }
    finally { busy.current = false; setSaving(false); }
  }

  return (<>
    <section className="rounded-xl border border-border bg-card text-card-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-semibold">Modifier la commande</h2>
          <p className="mt-1 text-sm text-muted-foreground">Articles, remise et livraison · avant confirmation</p>
        </div>
        <Button type="button" variant="outline" disabled={saving} aria-expanded={open} aria-controls="order-editor"
          onClick={() => { if (!open) reset(); setOpen(!open); }}>
          <PencilIcon data-icon="inline-start" aria-hidden />{open ? "Fermer" : "Modifier la commande"}
        </Button>
      </div>
      {open && <form id="order-editor" onSubmit={save} className="border-t border-border p-5">
        <fieldset disabled={saving} className="flex min-w-0 flex-col gap-6">
          <legend className="sr-only">Modification de la commande</legend>
          <p className="text-sm text-muted-foreground">Les articles déjà présents conservent leur prix ; les nouveaux articles sont au prix actuel du catalogue. L’offre upsell existante conserve son prix ; la remise supplémentaire s’applique uniquement aux autres articles. Toute offre encore en attente sera fermée à l’enregistrement.</p>
          <div className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const selected = options.find((v) => v.variantId === line.variantId);
              return <fieldset key={line.key} className="grid min-w-0 gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_5rem_auto]">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Article {index + 1}{line.upsellIndex !== undefined ? " · Upsell (prix conservé)" : ""}</legend>
                <label className="flex min-w-0 flex-col gap-2 text-sm">
                   <span>Produit · variante · SKU</span>
                  <Select value={line.variantId} disabled={saving} onValueChange={(variantId) => setLines(lines.map((l) => l.key === line.key ? { ...l, variantId } : l))}>
                    <SelectTrigger className="w-full min-w-0 [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:truncate" aria-label={`Variante de l’article ${index + 1}`}><SelectValue placeholder={`${line.name} — choisir une variante`} /></SelectTrigger>
                    <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] [&_[data-slot=select-item]]:whitespace-normal [&_[data-slot=select-item]]:break-words"><SelectGroup>{options.filter((v) => line.upsellIndex === undefined || v.productId === line.productId).map((v) =>
                      <SelectItem key={v.variantId} value={v.variantId}>{optionDescription(v)} · {v.available} disponible(s)</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">{formatMad(line.upsellPrice ?? (selected ? unitPriceOf(selected.variantId) : 0))} / unité{selected ? ` · Stock : ${selected.available}` : " · Sélection requise"}</span>
                </label>
                <label className="flex flex-col gap-2 text-sm">Quantité
                  <Input aria-label={`Quantité de l’article ${index + 1}`} type="number" min={1} max={line.upsellIndex !== undefined ? snapshot.upsellItems[line.upsellIndex].quantity : 10} step={1} required value={line.qty}
                    onChange={(e) => setLines(lines.map((l) => l.key === line.key ? { ...l, qty: Number(e.target.value) } : l))} />
                </label>
                <Button type="button" variant="ghost" size="sm" className="self-center" disabled={lines.length === 1} aria-label={`Retirer l’article ${index + 1}`}
                  onClick={() => setLines(lines.filter((l) => l.key !== line.key))}><Trash2Icon data-icon="inline-start" aria-hidden />Retirer</Button>
              </fieldset>;
            })}
          </div>
          <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border border-dashed border-border p-4">
            <legend className="px-1 text-sm font-medium">Ajouter un article</legend>
            <Input aria-label="Rechercher un produit" placeholder="Rechercher un produit, une variante, un SKU…" value={query} onChange={(e) => { setQuery(e.target.value); setAddVariant(""); }} />
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <Select value={addVariant} disabled={saving} onValueChange={setAddVariant}>
                <SelectTrigger className="w-full min-w-0 [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:truncate" aria-label="Article à ajouter"><SelectValue placeholder={filteredOptions.length ? "Choisir une variante" : "Aucun résultat"} /></SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] [&_[data-slot=select-item]]:whitespace-normal [&_[data-slot=select-item]]:break-words"><SelectGroup>{filteredOptions.map((v) => <SelectItem key={v.variantId} value={v.variantId} disabled={v.available < 1}>{optionDescription(v)} · {formatMad(v.price)} · Stock {v.available}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <Button type="button" variant="secondary" disabled={!addVariant || lines.length >= 50} onClick={() => {
                const v = options.find((o) => o.variantId === addVariant);
                if (v) setLines([...lines, { key: nextKey.current++, variantId: v.variantId, qty: 1, productId: v.productId, name: v.name }]);
                setAddVariant("");
              }}><PlusIcon data-icon="inline-start" aria-hidden />Ajouter</Button>
            </div>
          </fieldset>
          <div className="grid gap-6 md:grid-cols-2">
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-sm font-semibold">Remise sur les articles hors upsell</legend>
              <div className="flex flex-wrap gap-3 text-sm">{([['pack', 'Remise pack (automatique)'], ['manual', 'Remise manuelle']] as const).map(([value, label]) =>
                <label key={value} className="flex items-center gap-2"><input type="radio" name="discount-mode" value={value} checked={discountMode === value} onChange={() => setDiscountMode(value)} />{label}</label>)}</div>
              {discountMode === "pack" && <p className="text-xs text-muted-foreground">Le serveur applique le pack correspondant aux quantités, aux tarifs actuels des packs. Estimation : −{formatMad(packDiscount)}.</p>}
              {discountMode === "manual" && <>
              <div className="flex flex-wrap gap-3 text-sm">{([['none', 'Aucune'], ['fixed', 'Montant MAD'], ['percent', 'Pourcentage']] as const).map(([value, label]) =>
                <label key={value} className="flex items-center gap-2"><input type="radio" name="discount" value={value} checked={discountType === value} onChange={() => { setDiscountType(value); setDiscountValue("0"); }} />{label}</label>)}</div>
              {discountType !== "none" && <label className="flex flex-col gap-2 text-sm">{discountType === "percent" ? "Remise (%)" : "Remise (MAD)"}
                <Input type="number" min={0} max={discountType === "percent" ? 100 : regularSubtotal} step={1} required value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
              </label>}
              </>}
            </fieldset>
            <fieldset className="flex flex-col gap-3 text-sm">
              <legend className="mb-3 font-semibold">Livraison</legend>
              {([['auto', 'Automatique'], ['free', 'Gratuite'], ['paid', `Payante · ${formatMad(effectiveRules.shippingFeeMad)}`]] as const).map(([value, label]) =>
                <label key={value} className="flex items-center gap-2"><input type="radio" name="shipping" value={value} checked={shippingMode === value} onChange={() => setShippingMode(value)} />{label}</label>)}
              <p className="text-xs text-muted-foreground">Règles enregistrées avec la commande : {formatMad(shippingRules.shippingFeeMad)}, {shippingRules.freeShippingThresholdMad >= 1_000_000_000 ? "jamais offerte automatiquement (frais de ville)" : `offerte dès ${formatMad(shippingRules.freeShippingThresholdMad)} après remise, upsell inclus`}. Estimation ; le serveur fixe le montant définitif.</p>
              {cityFee && proposeCityFee && <label className="flex items-start gap-2 rounded-md border border-border p-3">
                <input type="checkbox" className="mt-1" checked={applyCityFee} onChange={(e) => setApplyCityFee(e.target.checked)} />
                <span>Frais de livraison pour {cityFee.cityName} : {formatMad(cityFee.feeMad)} (au lieu de {formatMad(cityFee.baseFeeMad)}){cityFee.ignoresFreeThreshold ? " · sans livraison offerte" : ""}. <strong>Appliquer</strong></span>
              </label>}
              {cityFee?.applied && <p className="text-xs text-muted-foreground">Frais de {cityFee.cityName} déjà appliqués : {formatMad(cityFee.feeMad)}.</p>}
            </fieldset>
          </div>
          <dl aria-live="polite" className="flex flex-col gap-2 rounded-lg bg-muted/50 p-4 text-sm tabular-nums">
            <div className="flex justify-between gap-3"><dt>Articles hors upsell</dt><dd>{formatMad(regularSubtotal)}</dd></div>
            {upsellSubtotal > 0 && <div className="flex justify-between gap-3"><dt>Upsell (prix déjà remisé)</dt><dd>{formatMad(upsellSubtotal)}</dd></div>}
            <div className="flex justify-between gap-3"><dt>{discountMode === "pack" ? "Remise pack (automatique)" : "Remise supplémentaire"}</dt><dd>−{formatMad(totals.discountAmount)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Livraison</dt><dd>{formatMad(totals.shipping)}</dd></div>
            <div className="flex flex-wrap justify-between gap-3 pt-2 text-lg font-semibold"><dt>À encaisser à la livraison</dt><dd>{formatMad(totals.total)}</dd></div>
            <div className="flex justify-between gap-3 text-muted-foreground"><dt>Montant actuel</dt><dd>{formatMad(snapshot.total)}</dd></div>
          </dl>
          <label className="flex flex-col gap-2 text-sm font-medium">Motif de modification
            <Textarea required minLength={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : le client souhaite un autre article et la livraison offerte." />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {conflict && <Button type="button" variant="outline" onClick={() => { setOpen(false); router.refresh(); }}>Recharger la commande</Button>}
            <Button type="button" variant="outline" onClick={() => { reset(); setOpen(false); }}>Abandonner les modifications</Button>
            <Button type="submit" disabled={saving || !lines.length}>{saving ? "Enregistrement…" : "Enregistrer la commande"}</Button>
          </div>
        </fieldset>
      </form>}
    </section>
    {!open && children}
    </>
  );
}
