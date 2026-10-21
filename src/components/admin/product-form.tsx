"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, Loader2Icon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QuantitiesGrid } from "@/components/admin/quantities-grid";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABELS, CATEGORY_SLUGS } from "@/lib/categories";
import type { Badge, CategorySlug } from "@/lib/types";
import type { CatalogProduct } from "@/lib/services/catalog";

interface ColorBlock {
  key: string;
  name: string;
  hex: string;
  images: string[];
}

interface FormState {
  name: string;
  slug: string;
  slugTouched: boolean;
  category: CategorySlug;
  price: string;
  description: string;
  story: string;
  materials: string;
  badge: string;
  isBestSeller: boolean;
  upsellRef: string;
  active: boolean;
  colors: ColorBlock[];
  sizes: number[];
}

const ALL_SIZES = Array.from({ length: 16 }, (_, i) => 30 + i);
const BADGES: Badge[] = ["Nouveau", "Best-seller", "Édition limitée"];

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let colorKeyCounter = 0;
function emptyColor(): ColorBlock {
  colorKeyCounter += 1;
  return { key: `new-${colorKeyCounter}`, name: "", hex: "#1a1a1a", images: [] };
}

function toFormState(product: CatalogProduct | null): FormState {
  if (!product) {
    return {
      name: "",
      slug: "",
      slugTouched: false,
      category: "bottines",
      price: "",
      description: "",
      story: "",
      materials: "",
      badge: "",
      isBestSeller: false,
      upsellRef: "",
      active: true,
      colors: [emptyColor()],
      sizes: [],
    };
  }
  return {
    name: product.name,
    slug: product.slug,
    slugTouched: true,
    category: product.category,
    price: String(product.price),
    description: product.description,
    story: product.story,
    materials: product.materials.join(", "),
    badge: product.badge ?? "",
    isBestSeller: product.isBestSeller,
    upsellRef: product.upsellRef ?? "",
    active: product.active,
    colors: product.colors.map((c) => ({
      key: c.id,
      name: c.name,
      hex: c.hex,
      images: [...c.images],
    })),
    // Only active variants map to checked sizes: deactivating a size keeps its
    // variant rows (order history), so inactive sizes must appear unchecked so
    // they can be re-added to restore them.
    sizes: product.variants
      .filter((v) => v.active)
      .map((v) => Number.parseInt(v.size, 10))
      .filter((n) => Number.isFinite(n) && !Number.isNaN(n))
      .filter((n, i, a) => a.indexOf(n) === i && n >= 30 && n <= 45),
  };
}

export function ProductForm({
  product,
  otherProducts,
}: {
  product: CatalogProduct | null;
  otherProducts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const isEdit = product !== null;
  const [state, setState] = useState<FormState>(() => toFormState(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const creationRequest = useRef<{ payload: string; body: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [withStock, setWithStock] = useState(false);
  const [stock, setStock] = useState<Record<string, string>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const stockCells = state.colors.filter((color) => color.name.trim()).flatMap((color) => state.sizes.map((size) => ({
    id: `${color.key}:${size}`, colorId: color.key, colorName: color.name.trim(), size: String(size),
  })));
  const filledStock = stockCells.filter((cell) => (stock[cell.id] ?? "").trim() !== "");

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const setName = (name: string) =>
    setState((prev) => ({
      ...prev,
      name,
      slug:
        prev.slugTouched && prev.slug ? prev.slug : slugify(name),
    }));

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!state.name.trim()) next.name = "Le nom du produit est requis.";
    else if (state.name.trim().length > 120)
      next.name = "Le nom du produit ne doit pas dépasser 120 caractères.";
    if (!state.slug.trim()) next.slug = "Le slug ne peut pas être vide.";
    else if (state.slug.trim().length > 120)
      next.slug = "Le slug ne doit pas dépasser 120 caractères.";
    const price = Number.parseInt(state.price, 10);
    if (!state.price.trim() || Number.isNaN(price) || String(price) !== state.price.trim())
      next.price = "Le prix doit être un nombre entier de MAD.";
    else if (price < 1) next.price = "Le prix doit être d'au moins 1 MAD.";
    if (!state.description.trim()) next.description = "La description est requise.";
    if (!state.story.trim()) next.story = "L'histoire du produit est requise.";
    const materials = state.materials
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    if (materials.length === 0) next.materials = "Au moins un matériau est requis.";
    if (state.colors.length === 0) next.colors = "Au moins une couleur est requise.";
    for (const color of state.colors) {
      if (!color.name.trim()) {
        next.colors = "Le nom de la couleur est requis.";
        break;
      }
      if (!/^#[0-9a-fA-F]{6}$/.test(color.hex.trim())) {
        next.colors = `Le code couleur de « ${color.name || "couleur"} » doit être un hexadécimal à 6 chiffres (ex. #1A1A1A).`;
        break;
      }
      if (color.images.length > 30) {
        next.colors = "Une couleur ne peut pas avoir plus de 30 images.";
        break;
      }
    }
    if (state.sizes.length === 0) next.sizes = "Au moins une pointure est requise.";
    if (new Set(state.colors.map((color) => color.name.trim().toLowerCase())).size !== state.colors.length) {
      next.colors = "Chaque couleur doit avoir un nom unique.";
    }
    if (!isEdit && withStock && filledStock.some((cell) => !/^\d+$/.test(stock[cell.id].trim()) || !Number.isSafeInteger(Number(stock[cell.id])))) {
      next.stock = "Les quantités initiales doivent être des entiers positifs ou nuls.";
    }
    return next;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submittingRef.current || uploadingKey) return;
    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      toast.error("Veuillez corriger les erreurs du formulaire.");
      return;
    }

    const colors = state.colors.map((c) => ({
      name: c.name.trim(),
      hex: c.hex.trim(),
      images: c.images,
    }));
    const materials = state.materials
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    const payload = {
      name: state.name.trim(),
      slug: state.slug.trim(),
      category: state.category,
      price: Number.parseInt(state.price, 10),
      description: state.description.trim(),
      story: state.story.trim(),
      materials,
      badge: state.badge === "" ? undefined : state.badge,
      isBestSeller: state.isBestSeller,
      upsellRef: state.upsellRef.trim() === "" ? undefined : state.upsellRef.trim(),
      colors,
      sizes: state.sizes,
      ...(!isEdit && withStock ? { initialStock: filledStock.map((cell) => ({ colorKey: cell.colorName, size: cell.size, qty: Number(stock[cell.id]) })) } : {}),
    };

    let body = JSON.stringify(isEdit ? { active: state.active, ...payload } : payload);
    if (!isEdit) {
      if (!uncertain && creationRequest.current?.payload !== body) {
        creationRequest.current = { payload: body, body: JSON.stringify({ ...payload, requestId: crypto.randomUUID() }) };
      }
      body = creationRequest.current!.body;
    }
    submittingRef.current = true;
    setSubmitting(true);
    let succeeded = false;
    try {
      const res = await fetch(
        isEdit ? `/api/admin/products/${product!.id}` : "/api/admin/products",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
      );
      if (!res.ok) {
        if (!isEdit && res.status >= 500) throw new Error("uncertain");
        setUncertain(false);
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Une erreur est survenue lors de l'enregistrement.");
        return;
      }
      toast.success(isEdit ? "Produit mis à jour." : "Produit créé.");
      succeeded = true;
      setUncertain(false);
      setStock({});
      router.push("/admin");
      router.refresh();
    } catch {
      if (!isEdit) setUncertain(true);
      toast.error(isEdit ? "Une erreur réseau est survenue." : "Création non confirmée. Réessayez le même enregistrement pour éviter un doublon.");
    } finally {
      if (!succeeded) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }

  async function handleUpload(key: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingKey(key);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as
        | { files?: string[]; error?: string }
        | null;
      if (!res.ok || !body?.files) {
        toast.error(body?.error ?? "Échec de l'upload.");
        return;
      }
      setState((prev) => ({
        ...prev,
        colors: prev.colors.map((c) =>
          c.key === key ? { ...c, images: [...c.images, ...body.files!] } : c,
        ),
      }));
    } catch {
      toast.error("Une erreur réseau est survenue pendant l'upload.");
    } finally {
      setUploadingKey(null);
      const input = fileInputs.current[key];
      if (input) input.value = "";
    }
  }

  function addPathToColor(key: string, path: string) {
    const trimmed = path.trim();
    if (!trimmed) return;
    setState((prev) => ({
      ...prev,
      colors: prev.colors.map((c) =>
        c.key === key ? { ...c, images: [...c.images, trimmed] } : c,
      ),
    }));
  }

  function removeImage(key: string, index: number) {
    setState((prev) => ({
      ...prev,
      colors: prev.colors.map((c) =>
        c.key === key ? { ...c, images: c.images.filter((_, i) => i !== index) } : c,
      ),
    }));
  }

  function moveImage(key: string, index: number, direction: -1 | 1) {
    setState((prev) => ({
      ...prev,
      colors: prev.colors.map((c) => {
        if (c.key !== key) return c;
        const target = index + direction;
        if (target < 0 || target >= c.images.length) return c;
        const images = [...c.images];
        [images[index], images[target]] = [images[target], images[index]];
        return { ...c, images };
      }),
    }));
  }

  function setColor(key: string, patch: Partial<ColorBlock>) {
    setState((prev) => ({
      ...prev,
      colors: prev.colors.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    }));
  }

  function toggleSize(size: number, checked: boolean) {
    if (!checked) setStock((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.endsWith(`:${size}`))));
    setState((prev) => ({
      ...prev,
      sizes: checked
        ? [...prev.sizes, size].sort((a, b) => a - b)
        : prev.sizes.filter((s) => s !== size),
    }));
  }

  const duplicateColorNames = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const c of state.colors) {
      const name = c.name.trim().toLowerCase();
      if (name) {
        if (seen.has(name)) dupes.add(name);
        seen.add(name);
      }
    }
    return dupes;
  }, [state.colors]);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <fieldset disabled={submitting || uncertain} className="min-w-0 space-y-8">
      <section className="space-y-4 rounded-xl border border-white/10 p-4 md:p-6">
        <h2 className="font-display text-lg font-semibold">Informations</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              value={state.name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={state.slug}
              onChange={(e) =>
                setState((prev) => ({ ...prev, slug: e.target.value, slugTouched: true }))
              }
              aria-invalid={!!errors.slug}
            />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Catégorie</Label>
            <Select
              value={state.category}
              onValueChange={(value) => update("category", value as CategorySlug)}
            >
              <SelectTrigger id="category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_SLUGS.map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {CATEGORY_LABELS[slug]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price">Prix (MAD)</Label>
            <Input
              id="price"
              type="number"
              min={1}
              step={1}
              value={state.price}
              onChange={(e) => update("price", e.target.value)}
              aria-invalid={!!errors.price}
            />
            {errors.price && <p className="text-xs text-destructive">{errors.price}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="badge">Badge</Label>
            <Select value={state.badge} onValueChange={(value) => update("badge", value)}>
              <SelectTrigger id="badge" className="w-full">
                <SelectValue placeholder="Aucun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {BADGES.map((badge) => (
                  <SelectItem key={badge} value={badge}>
                    {badge}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="upsell">Produit d&apos;upsell</Label>
            <Select value={state.upsellRef} onValueChange={(value) => update("upsellRef", value)}>
              <SelectTrigger id="upsell" className="w-full">
                <SelectValue placeholder="Aucun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {otherProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            rows={3}
            value={state.description}
            onChange={(e) => update("description", e.target.value)}
            aria-invalid={!!errors.description}
          />
          {errors.description && (
            <p className="text-xs text-destructive">{errors.description}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="story">Histoire</Label>
          <Textarea
            id="story"
            rows={3}
            value={state.story}
            onChange={(e) => update("story", e.target.value)}
            aria-invalid={!!errors.story}
          />
          {errors.story && <p className="text-xs text-destructive">{errors.story}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="materials">Matériaux (séparés par des virgules)</Label>
          <Input
            id="materials"
            value={state.materials}
            onChange={(e) => update("materials", e.target.value)}
            placeholder="Cuir véritable, Semelle cuir"
            aria-invalid={!!errors.materials}
          />
          {errors.materials && <p className="text-xs text-destructive">{errors.materials}</p>}
        </div>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="isBestSeller"
              checked={state.isBestSeller}
              onCheckedChange={(checked) => update("isBestSeller", checked === true)}
            />
            <Label htmlFor="isBestSeller">Best-seller</Label>
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="active"
                checked={state.active}
                onCheckedChange={(checked) => update("active", checked === true)}
              />
              <Label htmlFor="active">Actif</Label>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-white/10 p-4 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-semibold">Couleurs</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setState((prev) => ({ ...prev, colors: [...prev.colors, emptyColor()] }))
            }
          >
            <PlusIcon aria-hidden /> Ajouter une couleur
          </Button>
        </div>
        {errors.colors && <p className="text-xs text-destructive">{errors.colors}</p>}
        {state.colors.map((color, index) => (
          <div key={color.key} className="space-y-3 rounded-lg border border-white/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-white/70">Couleur {index + 1}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Supprimer cette couleur"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    colors: prev.colors.filter((c) => c.key !== color.key),
                  }))
                }
              >
                <Trash2Icon aria-hidden />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={`color-name-${color.key}`}>Nom</Label>
                <Input
                  id={`color-name-${color.key}`}
                  value={color.name}
                  onChange={(e) => setColor(color.key, { name: e.target.value })}
                />
                {duplicateColorNames.has(color.name.trim().toLowerCase()) && (
                  <p className="text-xs text-destructive">
                    Ce nom de couleur est déjà utilisé sur ce produit.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`color-hex-${color.key}`}>Couleur (hex)</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(color.hex) ? color.hex : "#1a1a1a"}
                    onChange={(e) => setColor(color.key, { hex: e.target.value.toUpperCase() })}
                    aria-label="Sélecteur de couleur"
                    className="size-8 shrink-0 cursor-pointer rounded border border-input bg-transparent"
                  />
                  <Input
                    id={`color-hex-${color.key}`}
                    value={color.hex}
                    onChange={(e) => setColor(color.key, { hex: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`color-upload-${color.key}`}>Images</Label>
                <input
                  ref={(el) => {
                    fileInputs.current[color.key] = el;
                  }}
                  id={`color-upload-${color.key}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUpload(color.key, e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingKey === color.key}
                  onClick={() => fileInputs.current[color.key]?.click()}
                >
                  {uploadingKey === color.key ? (
                    <>
                      <Loader2Icon className="animate-spin" aria-hidden /> Envoi…
                    </>
                  ) : (
                    <>
                      <PlusIcon aria-hidden /> Téléverser des images
                    </>
                  )}
                </Button>
              </div>
            </div>
            {color.images.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {color.images.map((image, imageIndex) => (
                  <li
                    key={`${image}-${imageIndex}`}
                    className="group relative size-16 overflow-hidden rounded-lg border border-white/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      aria-label="Retirer l'image"
                      onClick={() => removeImage(color.key, imageIndex)}
                      className="absolute end-0 top-0 rounded-bl-lg bg-black/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <XIcon className="size-3" aria-hidden />
                    </button>
                    <div className="absolute bottom-0 start-0 flex">
                      <button
                        type="button"
                        aria-label="Déplacer l'image vers la gauche"
                        disabled={imageIndex === 0}
                        onClick={() => moveImage(color.key, imageIndex, -1)}
                        className="bg-black/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
                      >
                        <ArrowUpIcon className="size-3 rotate-[-90deg]" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Déplacer l'image vers la droite"
                        disabled={imageIndex === color.images.length - 1}
                        onClick={() => moveImage(color.key, imageIndex, 1)}
                        className="bg-black/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
                      >
                        <ArrowDownIcon className="size-3 rotate-[-90deg]" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <AddPathInput onAdd={(path) => addPathToColor(color.key, path)} />
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-white/10 p-4 md:p-6">
        <h2 className="font-display text-lg font-semibold">Pointures</h2>
        {isEdit && (
          <p className="text-xs text-white/50">
            Désactiver une taille conserve l&apos;historique des commandes.
          </p>
        )}
        {errors.sizes && <p className="text-xs text-destructive">{errors.sizes}</p>}
        <div className="flex flex-wrap gap-3">
          {ALL_SIZES.map((size) => (
            <label
              key={size}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm has-[[data-state=checked]]:border-white has-[[data-state=checked]]:bg-white/10"
            >
              <Checkbox
                checked={state.sizes.includes(size)}
                onCheckedChange={(checked) => toggleSize(size, checked === true)}
                aria-label={`Pointure ${size}`}
              />
              {size}
            </label>
          ))}
        </div>
      </section>

      {!isEdit && (
        <section className="space-y-4 rounded-xl border border-white/10 p-4 md:p-6">
          <div className="flex items-center gap-2">
            <Checkbox id="with-initial-stock" checked={withStock} onCheckedChange={(checked) => setWithStock(checked === true)} />
            <Label htmlFor="with-initial-stock" className="font-display text-lg font-semibold">Stock initial (facultatif)</Label>
          </div>
          <p className="text-sm text-muted-foreground">Après avoir choisi les couleurs et pointures, saisissez les quantités présentes en rayon. Une case vide est omise ; 0 déclare explicitement un stock nul.</p>
          {withStock && (stockCells.length ? <>
            <QuantitiesGrid cells={stockCells} values={stock} onChange={(id, value) => setStock((previous) => ({ ...previous, [id]: value }))} />
            <p className="text-sm text-muted-foreground">{filledStock.length} variante(s) renseignée(s) · {filledStock.reduce((sum, cell) => sum + (Number(stock[cell.id]) || 0), 0)} paire(s)</p>
          </> : <p className="text-sm text-muted-foreground">Nommez les couleurs et sélectionnez au moins une pointure pour saisir le stock.</p>)}
          {errors.stock && <p role="alert" className="text-sm text-destructive">{errors.stock}</p>}
        </section>
      )}
      </fieldset>

      {uncertain && <p role="alert" className="rounded-lg border border-border p-3 text-sm text-muted-foreground">Le résultat de la création n’est pas confirmé. Les données et l’identifiant de requête sont conservés. Réessayez le même enregistrement pour retrouver le produit créé sans doublon.</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || uploadingKey !== null}>
          {submitting ? (
            <>
              <Loader2Icon className="animate-spin" aria-hidden /> Enregistrement…
            </>
          ) : uncertain ? (
            "Réessayer le même enregistrement"
          ) : isEdit ? (
            "Enregistrer les modifications"
          ) : (
            "Créer le produit"
          )}
        </Button>
        <Button type="button" variant="ghost" disabled={submitting || uncertain} onClick={() => router.push("/admin")}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function AddPathInput({ onAdd }: { onAdd: (path: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd(value);
            setValue("");
          }
        }}
        placeholder="Ajouter par chemin (ex. /images/products/…)"
        className="h-7 text-xs"
        aria-label="Chemin d'image existant"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!value.trim()}
        onClick={() => {
          onAdd(value);
          setValue("");
        }}
      >
        Ajouter
      </Button>
    </div>
  );
}
