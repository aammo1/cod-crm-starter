"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CommerceProduct, ProductOptionDefinition } from "@/lib/commerce-types";
import { validateOptionDefinitions, validateProductIdentity, validateVariantCombinations } from "@/lib/variant-options";
import { ImageGallery, VariantEditor, type VariantDraft } from "./variant-editor";
import { QuantitiesGrid } from "./quantities-grid";
import styles from "./catalog-form.module.css";

const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function ProductForm({ product, otherProducts }: { product: CommerceProduct | null; otherProducts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [fields, setFields] = useState({ name: product?.name ?? "", slug: product?.slug ?? "", category: product?.category ?? "", price: product ? String(product.price) : "", description: product?.description ?? "", story: product?.story ?? "", materials: product?.materials?.join(", ") ?? "", badge: product?.badge ?? "", upsellRef: product?.upsellRef ?? "", isBestSeller: product?.isBestSeller ?? false });
  const [slugTouched, setSlugTouched] = useState(!!product);
  const [images, setImages] = useState(product?.images ?? []);
  const [definitions, setDefinitions] = useState<ProductOptionDefinition[]>(product?.optionDefinitions ?? []);
  const [variants, setVariants] = useState<VariantDraft[]>(() => product ? product.variants.filter(v => v.active).map(v => ({ ...v, key: v.id })) : [{ key: "standard", options: [], sku: "", label: "Standard", images: [], active: true }]);
  const [withStock, setWithStock] = useState(false);
  const [stock, setStock] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const request = useRef<{ payload: string; body: string } | null>(null);
  const locked = useRef(false);
  const field = (key: keyof typeof fields, value: string | boolean) => setFields(prev => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current || uploads) return;
    let body: string;
    try {
      validateProductIdentity(fields);
      const axes = validateOptionDefinitions(definitions);
      if (axes.reduce((n, axis) => n * axis.values.length, 1) > 100) throw new Error("Au maximum 100 combinaisons sont autorisées.");
      validateVariantCombinations(variants.map(v => ({ ...v, id: v.id ?? v.key, sku: v.sku || `AUTO-${v.key}` })), axes);
      if (!/^\d+$/.test(fields.price) || !Number.isSafeInteger(Number(fields.price)) || Number(fields.price) < 1) throw new Error("Le prix doit être un entier d’au moins 1 MAD.");
      if (!fields.category.trim()) throw new Error("La catégorie est requise.");
      const initialStock = variants.filter(v => (stock[v.key] ?? "").trim() !== "").map(v => {
        const qty = stock[v.key].trim();
        if (!/^\d+$/.test(qty) || !Number.isSafeInteger(Number(qty))) throw new Error("Le stock initial doit être un entier positif ou nul.");
        return { options: v.options, qty: Number(qty) };
      });
      const payload = { ...fields, price: Number(fields.price), badge: fields.badge.trim() || null, upsellRef: fields.upsellRef || null, materials: fields.materials.split(",").map(v => v.trim()).filter(Boolean), images, optionDefinitions: axes, variants: variants.map(v => {
        // Hydration may return the product gallery as a fallback. Omit unchanged
        // images so an ordinary metadata edit does not turn that fallback into
        // a variant-specific gallery persisted forever.
        const original = product?.variants.find(row => row.id === v.id);
        const unchangedGallery = original && JSON.stringify(original.images) === JSON.stringify(v.images);
        return { ...(v.id ? { id: v.id } : {}), ...(v.sku ? { sku: v.sku } : {}), ...(v.label.trim() ? { label: v.label } : {}), options: v.options, ...(!unchangedGallery ? { images: v.images } : {}), active: v.active };
      }), ...(!product && withStock ? { initialStock } : {}) };
      body = JSON.stringify(payload);
      if (!product) {
        if (!uncertain && request.current?.payload !== body) request.current = { payload: body, body: JSON.stringify({ ...payload, requestId: crypto.randomUUID() }) };
        body = request.current!.body;
      }
    } catch (err) { setError((err as Error).message); return; }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(product ? `/api/admin/products/${encodeURIComponent(product.id)}` : "/api/admin/products", { method: product ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body });
      if (!response.ok) {
        if (!product && response.status >= 500) throw new Error("uncertain");
        setUncertain(false);
        const result = await response.json().catch(() => null);
        setError(typeof result?.error === "string" ? result.error : result?.error?.message ?? "Enregistrement impossible.");
        return;
      }
      toast.success(product ? "Produit mis à jour." : "Produit créé.");
      router.push("/admin");
      router.refresh();
    } catch {
      if (!product) setUncertain(true);
      setError(product ? "Une erreur réseau est survenue. Réessayez l’enregistrement." : "Création non confirmée. Réessayez le même enregistrement pour éviter un doublon.");
    } finally { locked.current = false; setBusy(false); }
  }

  return <form onSubmit={submit} className={`${styles.form} space-y-6`}>
    <fieldset disabled={busy || uncertain || uploads > 0} className="min-w-0 space-y-6">
      <section className="space-y-4 rounded-xl border border-border p-4 md:p-6">
        <h2 className="font-display text-lg font-semibold">Informations</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {([['name', 'Nom'], ['slug', 'Slug'], ['category', 'Catégorie'], ['price', 'Prix (MAD)'], ['badge', 'Badge (facultatif)']] as const).map(([key, label]) => <div key={key} className="space-y-1.5"><Label htmlFor={key}>{label}</Label><Input id={key} required={key !== 'badge'} type={key === 'price' ? 'number' : 'text'} min={key === 'price' ? 1 : undefined} step={key === 'price' ? 1 : undefined} value={fields[key]} onChange={e => { const value = e.target.value; if (key === 'name') setFields(prev => ({ ...prev, name: value, ...(!slugTouched ? { slug: slugify(value) } : {}) })); else { field(key, value); if (key === 'slug') setSlugTouched(true); } }} /></div>)}
          <div className="space-y-1.5"><Label htmlFor="upsellRef">Produit d’upsell (facultatif)</Label><select id="upsellRef" value={fields.upsellRef} onChange={e => field('upsellRef', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Aucun</option>{otherProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        </div>
        {([['description', 'Description'], ['story', 'Histoire (facultatif)']] as const).map(([key, label]) => <div key={key} className="space-y-1.5"><Label htmlFor={key}>{label}</Label><Textarea id={key} value={fields[key]} onChange={e => field(key, e.target.value)} rows={3} /></div>)}
        <div className="space-y-1.5"><Label htmlFor="materials">Matériaux (facultatif, séparés par des virgules)</Label><Input id="materials" value={fields.materials} onChange={e => field('materials', e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fields.isBestSeller} onChange={e => field('isBestSeller', e.target.checked)} />Best-seller</label>
      </section>
      <section className="space-y-4 rounded-xl border border-border p-4 md:p-6"><h2 className="font-display text-lg font-semibold">Galerie du produit</h2><ImageGallery id="product" images={images} onChange={setImages} onBusy={delta => setUploads(n => n + delta)} /></section>
      <VariantEditor definitions={definitions} onDefinitions={setDefinitions} variants={variants} onChange={setVariants} history={product?.variants ?? []} onBusy={delta => setUploads(n => n + delta)} />
      {!product ? <section className="space-y-4 rounded-xl border border-border p-4 md:p-6"><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={withStock} onChange={e => setWithStock(e.target.checked)} />Stock initial (facultatif)</label><p className="text-sm text-muted-foreground">Une case vide est omise ; 0 déclare un stock nul. Les mouvements suivants se font dans l’espace Stock.</p>{withStock && <QuantitiesGrid cells={variants.map(v => ({ id: v.key, label: v.label || 'Standard', sku: v.sku, disabled: !v.active }))} values={stock} onChange={(id, value) => setStock(prev => ({ ...prev, [id]: value }))} />}</section> : <p className="text-sm text-muted-foreground">Les quantités ne se modifient pas ici. Utilisez l’<Link className="underline" href="/crm/stock">espace Stock</Link> pour les réceptions et corrections.</p>}
    </fieldset>
    {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    {uncertain && <p className="text-sm text-muted-foreground">Les données et l’identifiant de création sont conservés pour la nouvelle tentative.</p>}
    <div className="flex flex-wrap gap-3"><Button disabled={busy || uploads > 0} type="submit">{busy ? 'Enregistrement…' : uncertain ? 'Réessayer le même enregistrement' : product ? 'Enregistrer les modifications' : 'Créer le produit'}</Button><Button asChild variant="ghost"><Link href="/admin">Retour au catalogue</Link></Button></div>
  </form>;
}
