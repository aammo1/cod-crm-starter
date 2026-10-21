"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CommerceVariant, ProductOptionDefinition, VariantOption } from "@/lib/commerce-types";
import { validateOptionDefinitions, variantOptionsKey, variantOptionsLabel } from "@/lib/variant-options";

export interface VariantDraft { key: string; id?: string; sku: string; label: string; options: VariantOption[]; images: string[]; active: boolean }

export function ImageGallery({ id, images, onChange, onBusy }: { id: string; images: string[]; onChange: (images: string[]) => void; onBusy: (delta: number) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return <div className="space-y-3">
    <Label htmlFor={`upload-${id}`}>Téléverser des images ({images.length}/30)</Label>
    <Input id={`upload-${id}`} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={async e => {
      const input = e.currentTarget;
      const files = Array.from(input.files ?? []);
      if (!files.length || lock.current) return;
      if (images.length + files.length > 30) { setError('Au maximum 30 images par galerie.'); input.value = ''; return; }
      lock.current = true; setBusy(true); onBusy(1); setError('');
      try {
        const form = new FormData(); files.forEach(file => form.append('file', file));
        const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
        const body = await res.json();
        if (!res.ok || !Array.isArray(body.files)) throw new Error(typeof body.error === 'string' ? body.error : 'Téléversement impossible.');
        onChange([...images, ...body.files]);
      } catch (err) { setError((err as Error).message); }
      finally { lock.current = false; setBusy(false); onBusy(-1); input.value = ''; }
    }} />
    {busy && <p role="status" className="text-xs text-muted-foreground">Téléversement en cours…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <ul className="flex flex-wrap gap-3">{images.map((image, index) => <li key={`${image}-${index}`} className="w-28 space-y-1 rounded-lg border border-border p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={`Image ${index + 1}`} className="aspect-square w-full rounded object-cover" />
      <div className="flex justify-between"><button type="button" disabled={busy || index === 0} aria-label={`Avancer l’image ${index + 1}`} className="p-1 disabled:opacity-30" onClick={() => { const next = [...images]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>←</button><button type="button" disabled={busy} aria-label={`Retirer l’image ${index + 1}`} className="p-1 text-xs" onClick={() => onChange(images.filter((_, i) => i !== index))}>Retirer</button><button type="button" disabled={busy || index === images.length - 1} aria-label={`Reculer l’image ${index + 1}`} className="p-1 disabled:opacity-30" onClick={() => { const next = [...images]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next); }}>→</button></div>
    </li>)}</ul>
    {!images.length && <p className="text-xs text-muted-foreground">Sans image spécifique, les variantes utilisent la galerie du produit.</p>}
  </div>;
}

export function VariantEditor({ definitions, onDefinitions, variants, onChange, history, onBusy }: { definitions: ProductOptionDefinition[]; onDefinitions: (axes: ProductOptionDefinition[]) => void; variants: VariantDraft[]; onChange: (variants: VariantDraft[]) => void; history: CommerceVariant[]; onBusy: (delta: number) => void }) {
  const [error, setError] = useState('');
  function generate() {
    try {
      const axes = validateOptionDefinitions(definitions);
      if (axes.reduce((n, axis) => n * axis.values.length, 1) > 100) throw new Error('Au maximum 100 combinaisons sont autorisées.');
      const combinations = axes.reduce<VariantOption[][]>((sets, axis) => sets.flatMap(set => axis.values.map(value => [...set, { name: axis.name, value }])) , [[]]);
      onChange(combinations.map(options => {
        const key = variantOptionsKey(options);
        const current = variants.find(v => variantOptionsKey(v.options) === key);
        if (current) return current;
        const previous = history.find(v => variantOptionsKey(v.options) === key);
        return previous ? { ...previous, key: previous.id, active: true } : { key: crypto.randomUUID(), options, label: variantOptionsLabel(options), sku: '', images: [], active: true };
      }));
      onDefinitions(axes); setError('');
    } catch (err) { setError((err as Error).message); }
  }
  const patch = (index: number, values: Partial<VariantDraft>) => onChange(variants.map((v, i) => i === index ? { ...v, ...values } : v));
  return <section className="space-y-5 rounded-xl border border-border p-4 md:p-6">
    <div><h2 className="font-display text-lg font-semibold">Options et variantes</h2><p className="mt-1 text-sm text-muted-foreground">Sans option : une variante Standard. Jusqu’à 3 options et 100 combinaisons. Le prix du produit s’applique à toutes les variantes.</p></div>
    {definitions.map((axis, index) => <div key={index} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_2fr_auto]">
      <div className="space-y-1.5"><Label htmlFor={`axis-${index}`}>Option {index + 1}</Label><Input id={`axis-${index}`} value={axis.name} placeholder="Ex. Contenance" onChange={e => onDefinitions(definitions.map((a, i) => i === index ? { ...a, name: e.target.value } : a))} /></div>
      <div className="space-y-1.5"><Label htmlFor={`values-${index}`}>Valeurs (séparées par des virgules)</Label><Input id={`values-${index}`} value={axis.values.join(',')} placeholder="Ex. 100 ml,500 ml" onChange={e => onDefinitions(definitions.map((a, i) => i === index ? { ...a, values: e.target.value.split(',') } : a))} /></div>
      <Button type="button" variant="ghost" className="self-end" onClick={() => onDefinitions(definitions.filter((_, i) => i !== index))}>Retirer l’option</Button>
    </div>)}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={definitions.length >= 3} onClick={() => onDefinitions([...definitions, { name: '', values: [''] }])}>Ajouter une option</Button><Button type="button" variant="outline" onClick={generate}>Générer les combinaisons</Button></div>
    <p className="text-xs text-muted-foreground">La génération réutilise les identifiants des combinaisons existantes. Pour renommer une combinaison en conservant son identité, modifiez ses valeurs dans sa ligne. Les variantes retirées deviennent indisponibles ; leur historique est conservé.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="space-y-3">{variants.map((variant, index) => <article key={variant.key} className="min-w-0 space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{variantOptionsLabel(variant.options)}</h3><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!definitions.length} checked={variant.active} onChange={e => patch(index, { active: e.target.checked })} />Disponible au catalogue</label></div>
      <p className="break-all font-mono text-xs text-muted-foreground">ID : {variant.id ?? 'Attribué à la création'}</p>
      <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor={`sku-${variant.key}`}>SKU {variant.id ? '(immuable)' : '(facultatif)'}</Label><Input id={`sku-${variant.key}`} readOnly={!!variant.id} value={variant.sku} placeholder="Généré automatiquement" onChange={e => patch(index, { sku: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor={`label-${variant.key}`}>Libellé</Label><Input id={`label-${variant.key}`} value={variant.label} onChange={e => patch(index, { label: e.target.value })} /></div>
      {definitions.map((axis, i) => <div key={i} className="space-y-1.5"><Label htmlFor={`option-${variant.key}-${i}`}>{axis.name || `Option ${i + 1}`}</Label><select id={`option-${variant.key}-${i}`} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={variant.options[i]?.value ?? ''} onChange={e => { const options = definitions.map((a, j) => ({ name: a.name.trim(), value: j === i ? e.target.value : variant.options[j]?.value ?? a.values[0]?.trim() ?? '' })); patch(index, { options, label: variantOptionsLabel(options) }); }}><option value="" disabled>Choisir</option>{axis.values.map((value, j) => <option key={j} value={value.trim()}>{value.trim()}</option>)}</select></div>)}
      </div>
      <ImageGallery id={variant.key} images={variant.images} onChange={images => patch(index, { images })} onBusy={onBusy} />
    </article>)}</div>
    {!!history.filter(v => !variants.some(row => row.id === v.id)).length && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Variantes historiques hors sélection</summary><ul className="mt-3 space-y-2">{history.filter(v => !variants.some(row => row.id === v.id)).map(v => <li key={v.id} className="break-words">{v.label} · {v.sku} · Indisponible après enregistrement</li>)}</ul></details>}
  </section>;
}
