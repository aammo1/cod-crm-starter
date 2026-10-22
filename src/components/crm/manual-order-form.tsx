"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { CityCombobox } from "@/components/crm/city-combobox";
import { Button } from "@/components/ui/button";
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
import {
  MANUAL_ORDER_SOURCES,
  MANUAL_ORDER_SOURCE_LABELS,
  type ManualOrderInput,
  type ManualOrderSource,
} from "@/lib/manual-order-schema";
import { normalizeMaPhone } from "@/lib/phone";
import { formatMad, shippingFor, type ShippingRules } from "@/lib/pricing";
import type { VariantOption } from "@/lib/commerce-types";

export interface SerializableVariant {
  variantId: string;
  sku: string;
  label: string;
  options: VariantOption[];
  available: number;
}

export interface SerializableProduct {
  id: string;
  name: string;
  price: number;
  variants: SerializableVariant[];
}

export interface SerializableCity {
  id: number;
  name: string;
}

export interface ManualOrderFormProps {
  products: SerializableProduct[];
  cities: SerializableCity[];
  shippingRules: ShippingRules;
}

interface OrderLineItem {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
}

interface SubmittedSnapshot {
  requestId: string;
  payload: ManualOrderInput;
}

const fieldClassName =
  "w-full min-w-0 border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:truncate";

function isPayloadDifferent(a: ManualOrderInput, b: ManualOrderInput): boolean {
  if (a.customer.name.trim() !== b.customer.name.trim()) return true;
  if (a.customer.phone.trim() !== b.customer.phone.trim()) return true;
  if (a.source !== b.source) return true;
  if ((a.address ?? "") !== (b.address ?? "")) return true;
  if ((a.cityId ?? null) !== (b.cityId ?? null)) return true;
  if ((a.note ?? "") !== (b.note ?? "")) return true;

  if (a.items.length !== b.items.length) return true;

  const sortFn = (x: { variantId: string }, y: { variantId: string }) =>
    x.variantId.localeCompare(y.variantId);
  const itemsA = [...a.items].sort(sortFn);
  const itemsB = [...b.items].sort(sortFn);

  for (let i = 0; i < itemsA.length; i++) {
    if (
      itemsA[i].variantId !== itemsB[i].variantId ||
      itemsA[i].qty !== itemsB[i].qty
    ) {
      return true;
    }
  }
  return false;
}

export function ManualOrderForm({ products, cities, shippingRules }: ManualOrderFormProps) {
  const router = useRouter();
  const formUid = useId();

  // One crypto.randomUUID() per draft
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID());

  // Customer info
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [source, setSource] = useState<ManualOrderSource>("manual_whatsapp");

  // Optional fields
  const [selectedCityId, setSelectedCityId] = useState<string>("none");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");

  // Product quick filter
  const [productSearch, setProductSearch] = useState("");

  // Items lines (initial state with 1 empty line)
  const [lines, setLines] = useState<OrderLineItem[]>(() => [
    {
      id: "line_1",
      productId: products.length === 1 ? products[0].id : "",
      variantId: products.length === 1 && products[0].variants.length === 1 ? products[0].variants[0].variantId : "",
      quantity: 1,
    },
  ]);

  // Submission & Retry states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uncertainSnapshot, setUncertainSnapshot] =
    useState<SubmittedSnapshot | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const busy = useRef(false);

  // Lookup maps
  const productsMap = useMemo(() => {
    const map = new Map<string, SerializableProduct>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const variantsMap = useMemo(() => {
    const map = new Map<string, { product: SerializableProduct; variant: SerializableVariant }>();
    for (const p of products) {
      for (const v of p.variants) {
        map.set(v.variantId, { product: p, variant: v });
      }
    }
    return map;
  }, [products]);

  // Filtered products list for dropdown
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase().trim();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  // Resolve variant for a line
  const getLineVariant = useCallback(
    (line: OrderLineItem): SerializableVariant | undefined => {
      const p = productsMap.get(line.productId);
      return p?.variants.find((v) => v.variantId === line.variantId);
    },
    [productsMap],
  );

  // Calculate aggregated quantities per variant across lines
  const variantTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const line of lines) {
      const v = getLineVariant(line);
      if (v) {
        totals.set(v.variantId, (totals.get(v.variantId) ?? 0) + line.quantity);
      }
    }
    return totals;
  }, [lines, getLineVariant]);

  // Display pricing calculations (pure helpers shippingFor / formatMad)
  const itemsSubtotal = useMemo(() => {
    let sub = 0;
    for (const line of lines) {
      const p = productsMap.get(line.productId);
      if (p && getLineVariant(line)) {
        sub += p.price * line.quantity;
      }
    }
    return sub;
  }, [lines, productsMap, getLineVariant]);

  const shipping = itemsSubtotal === 0 ? 0 : shippingFor(itemsSubtotal, shippingRules);
  const estimatedTotal = itemsSubtotal + shipping;

  // Line modification handlers
  function handleAddLine() {
    setLines((prev) => [
      ...prev,
      {
        id: "line_" + Math.random().toString(36).slice(2, 9),
        productId: products.length === 1 ? products[0].id : "",
        variantId: products.length === 1 && products[0].variants.length === 1 ? products[0].variants[0].variantId : "",
        quantity: 1,
      },
    ]);
  }

  function handleRemoveLine(index: number) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleProductChange(index: number, newProductId: string) {
    const newProduct = productsMap.get(newProductId);

    setLines((prev) =>
      prev.map((line, i) =>
        i === index
          ? {
              ...line,
              productId: newProductId,
              variantId: newProduct?.variants.length === 1 ? newProduct.variants[0].variantId : "",
            }
          : line,
      ),
    );
  }

  function handleVariantChange(index: number, variantId: string) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, variantId } : line)),
    );
  }

  function handleQuantityChange(index: number, newQty: number) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, quantity: newQty } : line)),
    );
  }

  // Construct current payload
  function buildCurrentPayload(): ManualOrderInput | null {
    // Group and aggregate lines by variantId
    const aggregated = new Map<string, number>();
    for (const line of lines) {
      const v = getLineVariant(line);
      if (!v) continue;
      aggregated.set(v.variantId, (aggregated.get(v.variantId) ?? 0) + line.quantity);
    }

    const payloadItems = Array.from(aggregated.entries()).map(
      ([variantId, qty]) => ({ variantId, qty }),
    );

    return {
      requestId,
      customer: {
        name: customerName.trim(),
        phone: customerPhone.trim(),
      },
      items: payloadItems,
      source,
      address: address.trim() || undefined,
      cityId: selectedCityId && selectedCityId !== "none" ? Number(selectedCityId) : undefined,
      note: note.trim() || undefined,
    };
  }

  // Check if modified compared to uncertain snapshot
  const currentPayload = buildCurrentPayload();
  const isModifiedSinceUncertain = useMemo(() => {
    if (!uncertainSnapshot || !currentPayload) return false;
    return isPayloadDifferent(currentPayload, uncertainSnapshot.payload);
  }, [uncertainSnapshot, currentPayload]);

  // Execute POST /api/crm/orders
  async function submitPayload(payload: ManualOrderInput) {
    if (busy.current) return;
    busy.current = true;
    setIsSubmitting(true);
    setGeneralError(null);
    setConflictError(null);

    try {
      const response = await fetch("/api/crm/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as
        | { orderId?: string; totals?: { itemsSubtotal: number; shipping: number; total: number }; error?: string }
        | null;

      if (response.status === 409) {
        const msg =
          data?.error ??
          "Conflit (409) : Cet identifiant de requête a déjà été utilisé pour une autre commande ou avec des données différentes.";
        setConflictError(msg);
        toast.error(msg);
        return;
      }

      if (!response.ok || !data?.orderId) {
        const msg =
          data?.error ??
          `Une erreur est survenue lors de la création de la commande (${response.status}).`;
        setGeneralError(msg);
        toast.error(msg);
        if (response.status >= 500) {
          setUncertainSnapshot({ requestId: payload.requestId, payload });
        }
        return;
      }

      // Success (201 Created or 200 Replay)
      setUncertainSnapshot(null);
      if (response.status === 200) {
        toast.success("Commande déjà enregistrée (rejeu identique de la requête). Redirection…");
      } else {
        toast.success("Commande créée avec succès en Nouvelle. Redirection…");
      }

      router.push(`/crm/orders/${data.orderId}`);
      router.refresh();
    } catch (err) {
      console.error("Network error during manual order creation:", err);
      setUncertainSnapshot({ requestId: payload.requestId, payload });
      const msg =
        "La connexion avec le serveur a été interrompue. L'état de la commande est incertain. Vous pouvez réassayer la requête originale sans risque de doublon.";
      setGeneralError(msg);
      toast.error(msg);
    } finally {
      busy.current = false;
      setIsSubmitting(false);
    }
  }

  // Validate form client-side
  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    if (!customerName.trim() || customerName.trim().length < 2) {
      errors.customerName = "Le nom complet est requis (au moins 2 caractères).";
    }

    if (!customerPhone.trim()) {
      errors.customerPhone = "Le numéro de téléphone est requis.";
    } else if (normalizeMaPhone(customerPhone) === null) {
      errors.customerPhone = "Numéro marocain invalide (ex : 0612345678 ou +212612345678).";
    }

    if (lines.length === 0) {
      errors.items = "Au moins un article est requis.";
    } else {
      let hasIncomplete = false;
      for (const line of lines) {
        const v = getLineVariant(line);
        if (!v) {
          hasIncomplete = true;
          break;
        }
      }
      if (hasIncomplete) {
        errors.items = "Veuillez choisir un produit et une variante pour chaque article.";
      }
    }

    // Check aggregate qty limit <= 10
    for (const [variantId, totalQty] of variantTotals.entries()) {
      if (totalQty > 10) {
        const vInfo = variantsMap.get(variantId);
        const name = vInfo ? `${vInfo.product.name} (${vInfo.variant.label || "Standard"} · SKU ${vInfo.variant.sku})` : "Un article";
        errors.items = `La quantité cumulée pour « ${name} » dépasse 10 (actuellement ${totalQty}).`;
        break;
      }
    }

    if (address.length > 500) {
      errors.address = "L'adresse ne peut pas dépasser 500 caractères.";
    }

    if (note.length > 2000) {
      errors.note = "La note ne peut pas dépasser 2000 caractères.";
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateForm()) return;

    if (uncertainSnapshot && isModifiedSinceUncertain) {
      toast.error("Modifications détectées après une requête incertaine. Veuillez d'abord réassayer la requête originale.");
      return;
    }

    const payload = buildCurrentPayload();
    if (!payload) return;

    submitPayload(payload);
  }

  // Restore form to uncertain snapshot
  function handleRestoreOriginal() {
    if (!uncertainSnapshot) return;
    const original = uncertainSnapshot.payload;
    setCustomerName(original.customer.name);
    setCustomerPhone(original.customer.phone);
    setSource(original.source);
    setSelectedCityId(original.cityId ? String(original.cityId) : "none");
    setAddress(original.address ?? "");
    setNote(original.note ?? "");

    // Restore lines from original items
    const restoredLines: OrderLineItem[] = [];
    for (let i = 0; i < original.items.length; i++) {
      const item = original.items[i];
      const vInfo = variantsMap.get(item.variantId);
      if (vInfo) {
        restoredLines.push({
          id: "line_restored_" + i,
          productId: vInfo.product.id,
          variantId: item.variantId,
          quantity: item.qty,
        });
      }
    }

    if (restoredLines.length > 0) {
      setLines(restoredLines);
    }
    setClientErrors({});
    toast.info("Données initiales de la requête restaurées.");
  }

  // Abandon draft and start fresh
  function handleDiscardAndReset() {
    if (
      !confirm(
        "Voulez-vous vraiment abandonner ce brouillon et générer une nouvelle commande vide ? L'identifiant de requête sera renouvelé.",
      )
    ) {
      return;
    }
    setRequestId(crypto.randomUUID());
    setUncertainSnapshot(null);
    setConflictError(null);
    setGeneralError(null);
    setClientErrors({});
    setCustomerName("");
    setCustomerPhone("");
    setSource("manual_whatsapp");
    setSelectedCityId("none");
    setAddress("");
    setNote("");
    setLines([
      {
        id: "line_1",
        productId: products.length === 1 ? products[0].id : "",
        variantId: products.length === 1 && products[0].variants.length === 1 ? products[0].variants[0].variantId : "",
        quantity: 1,
      },
    ]);
    toast.info("Nouveau brouillon initialisé.");
  }

  // If catalog is empty
  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--crm-warning)]/30 bg-[var(--crm-warning-bg)] p-6 text-center">
        <h2 className="text-base font-semibold text-[var(--crm-warning)]">
          Catalogue indisponible
        </h2>
        <p className="mt-2 text-sm text-[var(--crm-warning)]/80">
          Aucun produit ou variante active n&apos;est actuellement disponible dans le catalogue pour créer une commande.
        </p>
        <div className="mt-6">
          <Button asChild variant="outline" className="border-[var(--crm-warning)]/40 text-[var(--crm-warning)] hover:bg-[var(--crm-warning-bg)]/80">
            <Link href="/crm/orders">Retour aux commandes</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* 409 Conflict banner */}
      {conflictError ? (
        <div
          role="alert"
          className="rounded-xl border border-[var(--crm-danger)]/40 bg-[var(--crm-danger-bg)] p-4 text-[var(--crm-danger)]"
        >
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="mt-0.5 size-5 shrink-0 text-[var(--crm-danger)]" aria-hidden />
            <div className="space-y-2">
              <h3 className="font-semibold text-[var(--crm-danger)]">Conflit de requête (409)</h3>
              <p className="text-sm text-[var(--crm-danger)]/90">{conflictError}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleDiscardAndReset}
                  className="border-[var(--crm-danger)]/40 text-[var(--crm-danger)] hover:bg-[var(--crm-danger-bg)]/80"
                >
                  <RotateCcwIcon className="mr-1.5 size-3.5" aria-hidden />
                  Créer un nouveau brouillon
                </Button>
                <Button asChild size="sm" variant="ghost" className="text-[var(--crm-danger)] hover:text-foreground">
                  <Link href="/crm/orders">Consulter la liste des commandes</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Uncertain Snapshot banner */}
      {uncertainSnapshot ? (
        <div
          role="alert"
          className="rounded-xl border border-[var(--crm-warning)]/50 bg-[var(--crm-warning-bg)] p-4 text-[var(--crm-warning)]"
        >
          <div className="flex items-start gap-3">
            <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-[var(--crm-warning)]" aria-hidden />
            <div className="space-y-2">
              <h3 className="font-semibold text-[var(--crm-warning)]">
                Requête précédente incertaine (perte de connexion)
              </h3>
              <p className="text-sm text-[var(--crm-warning)]/90">
                Le serveur a peut-être déjà enregistré cette commande avec l&apos;identifiant de requête{" "}
                <code className="rounded bg-muted px-1 text-xs text-foreground">
                  {uncertainSnapshot.requestId.slice(0, 8)}…
                </code>
                . Pour éviter tout doublon, vous devez d&apos;abord réassayer la requête originale.
              </p>
              {isModifiedSinceUncertain ? (
                <div className="rounded-lg border border-[var(--crm-warning)]/30 bg-card/60 p-3 text-xs text-[var(--crm-warning)]">
                  <p className="font-medium text-[var(--crm-warning)]">
                    ⚠️ Les champs ont été modifiés depuis la tentative interrompue.
                  </p>
                  <p className="mt-1">
                    Envoyer ces modifications sous le même identifiant provoquera une erreur 409. Rétablissez la saisie originale ou abandonnez ce brouillon.
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={() => submitPayload(uncertainSnapshot.payload)}
                  className="bg-[var(--crm-warning)] text-foreground font-medium hover:opacity-90"
                >
                  {isSubmitting ? "Vérification en cours…" : "Réessayer la requête originale"}
                </Button>
                {isModifiedSinceUncertain ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRestoreOriginal}
                    className="border-[var(--crm-warning)]/40 text-[var(--crm-warning)] hover:bg-[var(--crm-warning-bg)]/80"
                  >
                    Rétablir la saisie originale
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleDiscardAndReset}
                  className="text-[var(--crm-warning)] hover:text-foreground"
                >
                  Abandonner et recommencer
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* General error message */}
      {generalError && !uncertainSnapshot && !conflictError ? (
        <div
          role="alert"
          className="rounded-xl border border-[var(--crm-danger)]/30 bg-[var(--crm-danger-bg)] p-4 text-sm text-[var(--crm-danger)]"
        >
          {generalError}
        </div>
      ) : null}

      {/* Section 1: Customer details & source */}
      <section className="rounded-xl border border-border bg-card p-5 text-card-foreground">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Client & Canal d&apos;origine
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Customer Name */}
          <div>
            <Label htmlFor={`${formUid}-name`} className="text-xs font-medium text-muted-foreground">
              Nom complet du client <span className="text-[var(--crm-danger)]">*</span>
            </Label>
            <Input
              id={`${formUid}-name`}
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="ex : Fatima Zahra"
              disabled={isSubmitting}
              className={`mt-1.5 ${fieldClassName} ${
                clientErrors.customerName ? "border-[var(--crm-danger)]/60 focus-visible:ring-[var(--crm-danger)]/20" : ""
              }`}
            />
            {clientErrors.customerName ? (
              <p className="mt-1 text-xs text-[var(--crm-danger)]" role="alert">
                {clientErrors.customerName}
              </p>
            ) : null}
          </div>

          {/* Customer Phone */}
          <div>
            <Label htmlFor={`${formUid}-phone`} className="text-xs font-medium text-muted-foreground">
              Numéro de téléphone marocain <span className="text-[var(--crm-danger)]">*</span>
            </Label>
            <Input
              id={`${formUid}-phone`}
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="ex : 0612345678"
              disabled={isSubmitting}
              className={`mt-1.5 ${fieldClassName} ${
                clientErrors.customerPhone ? "border-[var(--crm-danger)]/60 focus-visible:ring-[var(--crm-danger)]/20" : ""
              }`}
            />
            {clientErrors.customerPhone ? (
              <p className="mt-1 text-xs text-[var(--crm-danger)]" role="alert">
                {clientErrors.customerPhone}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Formats acceptés : 06XXXXXXXX, 07XXXXXXXX ou +212…
              </p>
            )}
          </div>

          {/* Order Source */}
          <div>
            <Label htmlFor={`${formUid}-source`} className="text-xs font-medium text-muted-foreground">
              Canal de réception <span className="text-[var(--crm-danger)]">*</span>
            </Label>
            <div className="mt-1.5">
              <Select
                value={source}
                onValueChange={(val) => setSource(val as ManualOrderSource)}
                disabled={isSubmitting}
              >
                <SelectTrigger id={`${formUid}-source`} className={fieldClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_ORDER_SOURCES.map((src) => (
                    <SelectItem key={src} value={src}>
                      {MANUAL_ORDER_SOURCE_LABELS[src]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Line items */}
      <section className="rounded-xl border border-border bg-card p-5 text-card-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Articles commandés <span className="text-[var(--crm-danger)]">*</span>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sélectionnez les produits et variantes demandés par le client.
            </p>
          </div>
          {products.length > 5 ? (
            <div className="w-56">
              <Input
                type="search"
                placeholder="Filtrer les produits…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="h-8 text-xs border-input bg-card text-foreground"
                aria-label="Filtrer les produits par nom"
              />
            </div>
          ) : null}
        </div>

        {clientErrors.items ? (
          <div className="mt-3 rounded-lg border border-[var(--crm-danger)]/40 bg-[var(--crm-danger-bg)] p-3 text-xs text-[var(--crm-danger)]" role="alert">
            {clientErrors.items}
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {lines.map((line, index) => {
            const product = productsMap.get(line.productId);
            const selectedVariant = getLineVariant(line);
            const variantTotalQty = selectedVariant
              ? variantTotals.get(selectedVariant.variantId) ?? line.quantity
              : line.quantity;
            const isDuplicate = selectedVariant
              ? lines.filter((l) => getLineVariant(l)?.variantId === selectedVariant.variantId).length > 1
              : false;

            return (
              <div
                key={line.id}
                className="rounded-lg border border-border bg-muted/30 p-4 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2.5 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Article #{index + 1}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {product ? formatMad(product.price * line.quantity) : "0 MAD"}
                    </span>
                    {lines.length > 1 ? (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => handleRemoveLine(index)}
                        disabled={isSubmitting}
                        className="text-muted-foreground hover:text-[var(--crm-danger)] hover:bg-[var(--crm-danger-bg)]"
                        aria-label={`Supprimer l'article ${index + 1}`}
                      >
                        <Trash2Icon className="size-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_6rem]">
                  {/* Product select */}
                  <div>
                    <Label className="text-[11px] font-medium text-muted-foreground">
                      Produit <span className="text-[var(--crm-danger)]">*</span>
                    </Label>
                    <div className="mt-1">
                      <Select
                        value={line.productId}
                        onValueChange={(val) => handleProductChange(index, val)}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger className={`${fieldClassName} min-w-0`} aria-label={`Produit de l’article ${index + 1}`}>
                          <SelectValue placeholder="Choisir un produit…" />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] [&_[data-slot=select-item]]:whitespace-normal [&_[data-slot=select-item]]:break-words">
                          {filteredProducts.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} ({formatMad(p.price)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Stable variant ID, arbitrary option values */}
                  <div>
                    <Label className="text-[11px] font-medium text-muted-foreground">
                      Variante · options · SKU <span className="text-[var(--crm-danger)]">*</span>
                    </Label>
                    <div className="mt-1">
                      <Select
                        value={line.variantId}
                        onValueChange={(val) => handleVariantChange(index, val)}
                        disabled={isSubmitting || !product}
                      >
                        <SelectTrigger className={`${fieldClassName} min-w-0`} aria-label={`Variante de l’article ${index + 1}`}>
                          <SelectValue
                            placeholder={!product ? "D'abord choisir le produit" : "Choisir une variante…"}
                          />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] [&_[data-slot=select-item]]:whitespace-normal [&_[data-slot=select-item]]:break-words">
                          {product?.variants.map((v) => (
                            <SelectItem key={v.variantId} value={v.variantId}>
                              {v.label || "Standard"}{v.options.length ? ` · ${v.options.map((o) => `${o.name} : ${o.value}`).join(" / ")}` : ""} · SKU {v.sku}{" "}
                              {v.available > 0
                                ? `(${v.available} en stock)`
                                : "(0 en stock — rupture)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Quantity select */}
                  <div>
                    <Label className="text-[11px] font-medium text-muted-foreground">
                      Quantité <span className="text-[var(--crm-danger)]">*</span>
                    </Label>
                    <div className="mt-1">
                      <Select
                        value={String(line.quantity)}
                        onValueChange={(val) => handleQuantityChange(index, Number(val))}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger className={fieldClassName} aria-label={`Quantité de l’article ${index + 1}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                            <SelectItem key={num} value={String(num)}>
                              {num}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Stock warning if zero-stock active variant */}
                {selectedVariant && selectedVariant.available <= 0 ? (
                  <div className="mt-3 flex items-center gap-1.5 rounded-md border border-[var(--crm-warning)]/30 bg-[var(--crm-warning-bg)] px-2.5 py-1.5 text-xs text-[var(--crm-warning)]">
                    <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden />
                    <span>
                      Rupture de stock (0 unité disponible). La commande sera créée en Nouvelle, mais le stock devra être disponible à la confirmation.
                    </span>
                  </div>
                ) : null}

                {/* Duplicate variant notices */}
                {isDuplicate && selectedVariant ? (
                  <div
                    className={`mt-2 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${
                      variantTotalQty > 10
                        ? "border border-[var(--crm-danger)]/40 bg-[var(--crm-danger-bg)] text-[var(--crm-danger)]"
                        : "border border-[var(--crm-info)]/30 bg-[var(--crm-info-bg)] text-[var(--crm-info)]"
                    }`}
                  >
                    {variantTotalQty > 10 ? (
                      <AlertCircleIcon className="size-3.5 shrink-0" aria-hidden />
                    ) : (
                      <InfoIcon className="size-3.5 shrink-0" aria-hidden />
                    )}
                    <span>
                      Variante présente sur plusieurs lignes (total cumulé : {variantTotalQty} / 10).
                      {variantTotalQty > 10 ? " La limite de 10 est dépassée !" : " Les quantités seront fusionnées à l'enregistrement."}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddLine}
            disabled={isSubmitting || lines.length >= 50}
            className="border-border text-foreground hover:bg-muted"
          >
            <PlusIcon className="mr-1.5 size-3.5" aria-hidden />
            Ajouter un article
          </Button>
        </div>
      </section>

      {/* Section 3: Delivery details & Internal note */}
      <section className="rounded-xl border border-border bg-card p-5 text-card-foreground">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Livraison & Notes internes (optionnels)
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* City */}
          <div>
            <Label htmlFor={`${formUid}-city`} className="text-xs font-medium text-muted-foreground">
              Ville de livraison
            </Label>
            <div className="mt-1.5">
              <CityCombobox
                id={`${formUid}-city`}
                cities={cities}
                value={selectedCityId === "none" ? "" : selectedCityId}
                onChange={(next) => setSelectedCityId(next || "none")}
                disabled={isSubmitting || cities.length === 0}
                noneLabel="Non renseignée (à préciser à la confirmation)"
                className={fieldClassName}
              />
            </div>
            {cities.length === 0 ? (
              <p className="mt-1 text-[11px] text-[var(--crm-warning)]">
                Aucune ville synchronisée. La ville pourra être choisie lors de la confirmation.
              </p>
            ) : null}
          </div>

          {/* Address */}
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor={`${formUid}-address`} className="text-xs font-medium text-muted-foreground">
                Adresse de livraison
              </Label>
              <span className="text-[11px] text-muted-foreground">{address.length}/500</span>
            </div>
            <Textarea
              id={`${formUid}-address`}
              value={address}
              onChange={(e) => setAddress(e.target.value.slice(0, 500))}
              placeholder="Quartier, résidence, rue, n°…"
              rows={2}
              disabled={isSubmitting}
              className={`mt-1.5 ${fieldClassName} ${
                clientErrors.address ? "border-[var(--crm-danger)]/60" : ""
              }`}
            />
            {clientErrors.address ? (
              <p className="mt-1 text-xs text-[var(--crm-danger)]" role="alert">
                {clientErrors.address}
              </p>
            ) : null}
          </div>

          {/* Internal note */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${formUid}-note`} className="text-xs font-medium text-muted-foreground">
                Note interne (attribuée dans le journal de contact)
              </Label>
              <span className="text-[11px] text-muted-foreground">{note.length}/2000</span>
            </div>
            <Textarea
              id={`${formUid}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 2000))}
              placeholder="Instructions particulières de livraison, créneau préféré par le client, contexte…"
              rows={3}
              disabled={isSubmitting}
              className={`mt-1.5 ${fieldClassName} ${
                clientErrors.note ? "border-[var(--crm-danger)]/60" : ""
              }`}
            />
            {clientErrors.note ? (
              <p className="mt-1 text-xs text-[var(--crm-danger)]" role="alert">
                {clientErrors.note}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Cette note sera consignée dans l&apos;historique de la commande avec la mention du canal choisi.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Section 4: Totals calculation & Submission */}
      <section className="rounded-xl border border-border bg-card p-5 text-card-foreground">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Estimation du montant
            </h2>
            <div className="text-xs text-muted-foreground">
              Calcul indicatif basé sur le catalogue. Les totaux définitifs sont calculés et fixés par le serveur.
            </div>
            <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Sous-total : </span>
                <span className="font-semibold tabular-nums text-foreground">{formatMad(itemsSubtotal)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Livraison : </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {itemsSubtotal === 0
                    ? "—"
                    : shipping === 0
                    ? `Offerte (dès ${formatMad(shippingRules.freeShippingThresholdMad)})`
                    : formatMad(shipping)}
                </span>
              </div>
              <div className="border-l border-border pl-6">
                <span className="text-muted-foreground">Total estimé : </span>
                <span className="text-base font-bold tabular-nums text-foreground">{formatMad(estimatedTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm font-medium text-muted-foreground">
            La commande sera créée en Nouvelle. Le stock sera réservé à la confirmation.
          </p>

          <div className="flex items-center gap-3 shrink-0">
            <Button asChild variant="ghost" disabled={isSubmitting} className="text-muted-foreground hover:text-foreground">
              <Link href="/crm/orders">Annuler</Link>
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || (uncertainSnapshot !== null && isModifiedSinceUncertain)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 font-medium min-h-[44px]"
            >
              {isSubmitting
                ? "Création en cours…"
                : uncertainSnapshot && !isModifiedSinceUncertain
                ? "Réessayer la commande"
                : "Créer la commande"}
            </Button>
          </div>
        </div>
      </section>
    </form>
  );
}
