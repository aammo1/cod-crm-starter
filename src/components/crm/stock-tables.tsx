"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BoxesIcon, SlidersHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { VariantOption } from "@/lib/commerce-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const fieldClassName =
  "w-full border-input bg-background text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-ring/20";

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

export interface StockVariantRow {
  productId: string;
  canOpen: boolean;
  variantId: string;
  sku: string;
  productName: string;
  label: string;
  options: VariantOption[];
  images: string[];
  active: boolean;
  productActive: boolean;
  physical: number;
  reserved: number;
  quarantine: number;
  available: number;
  openedAt: string | null;
  openedAtLabel: string | null;
}

export function StockVariantIdentity({ row }: { row: StockVariantRow }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      {row.images[0] && <Image src={row.images[0]} alt="" width={48} height={48} unoptimized className="size-12 shrink-0 rounded-md border border-border object-cover" />}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium break-words">{row.label || "Standard"}</span>
        {row.options.length > 0 && <span className="text-xs text-muted-foreground break-words">{row.options.map((option) => `${option.name} : ${option.value}`).join(" · ")}</span>}
        <span className="font-mono text-xs text-muted-foreground break-all">{row.sku}</span>
        {(!row.active || !row.productActive) && <Badge variant="secondary">Archivé</Badge>}
      </div>
    </div>
  );
}

export interface StockMovementRow {
  id: string;
  dateLabel: string;
  variantLabel: string;
  kind: string;
  qty: number;
  reason: string | null;
  orderId: string | null;
  actor: string;
  source: string;
  ref: string;
}

const LOW_STOCK_THRESHOLD = 3;

const MOVEMENT_KIND_LABELS: Record<string, string> = {
  opening: "Ouverture",
  reserve: "Réservation",
  release: "Libération",
  dispatch: "Remise au livreur",
  receive_sellable: "Réception vendable",
  receive_quarantine: "Retour endommagé",
  adjust_physical: "Ajustement physique",
  adjust_quarantine: "Ajustement quarantaine",
};

function QtyCell({ qty }: { qty: number }) {
  return (
    <span
      className={
        qty > 0
          ? "font-medium text-[var(--crm-success)]"
          : qty < 0
            ? "font-medium text-[var(--crm-danger)]"
            : "text-muted-foreground"
      }
    >
      {qty > 0 ? `+${qty}` : `${qty}`}
    </span>
  );
}

// --- Soldes par variante + ajustements (admin).

function stateFor(available: number): { label: string; className: string } {
  if (available === 0) {
    return { label: "Épuisé", className: "border-[var(--crm-neutral)]/40 bg-[var(--crm-neutral-bg)] text-[var(--crm-neutral)]" };
  }
  if (available <= LOW_STOCK_THRESHOLD) {
    return { label: "Stock bas", className: "border-[var(--crm-warning)]/40 bg-[var(--crm-warning-bg)] text-[var(--crm-warning)]" };
  }
  return { label: "OK", className: "border-[var(--crm-success)]/40 bg-[var(--crm-success-bg)] text-[var(--crm-success)]" };
}

export function BalancesTable({
  rows,
  isAdmin,
}: {
  rows: StockVariantRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [productFilter, setProductFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState<StockVariantRow | null>(null);
  const [quarantineDelta, setQuarantineDelta] = useState("");
  const [reason, setReason] = useState("");
  const adjustmentRequest = useRef<{ payload: string; id: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);

  const products = useMemo(
    () => [...new Map(rows.map((row) => [row.productId, row.productName])).entries()],
    [rows],
  );
  const filtered = rows.filter((row) => {
    const needle = search.trim().toLocaleLowerCase("fr");
    return (productFilter === "all" || row.productId === productFilter) &&
      [row.productName, row.sku, row.label, ...row.options.flatMap((option) => [option.name, option.value])].join(" ").toLocaleLowerCase("fr").includes(needle);
  });

  function openAdjust(row: StockVariantRow) {
    setAdjusting(row);
    setQuarantineDelta("");
    setReason("");
    setMessage("");
    setUncertain(false);
    adjustmentRequest.current = null;
  }

  function closeAdjust() {
    if (busyRef.current || uncertain) return;
    setAdjusting(null);
  }

  async function onAdjust() {
    if (!isAdmin || busyRef.current || !adjusting) return;
    const physicalValue = 0;
    const quarantineValue = Number(quarantineDelta);
    if (!Number.isSafeInteger(physicalValue) || !Number.isSafeInteger(quarantineValue)) {
      toast.error("Les quantités doivent être des nombres entiers.");
      return;
    }
    if (physicalValue === 0 && quarantineValue === 0) {
      toast.error("Indiquez une quantité à ajouter ou retirer de la quarantaine.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Veuillez indiquer un motif d'ajustement.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    const payload = JSON.stringify({ variantId: adjusting.variantId, physicalDelta: physicalValue,
      quarantineDelta: quarantineValue, reason: reason.trim() });
    if (adjustmentRequest.current?.payload !== payload) {
      adjustmentRequest.current = { payload, id: crypto.randomUUID() };
    }
    try {
      const response = await fetch("/api/crm/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: adjusting.variantId,
          requestId: adjustmentRequest.current.id,
          physicalDelta: physicalValue,
          quarantineDelta: quarantineValue,
          reason: reason.trim(),
        }),
      });
      if (response.status >= 500) throw new Error("uncertain");
      if (!response.ok) {
        setUncertain(false);
        const error = await readError(response, "Erreur lors de l'ajustement.");
        setMessage(response.status === 409 ? `${error} Actualisez les soldes avant un nouvel ajustement.` : error);
        toast.error(error);
        return;
      }
      toast.success("Ajustement enregistré.");
      setUncertain(false);
      setAdjusting(null);
      router.refresh();
    } catch {
      setUncertain(true);
      toast.error("Résultat non confirmé. Réessayez le même ajustement pour éviter un doublon.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BoxesIcon className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Soldes par variante
          </h2>
          <span className="text-muted-foreground/70">({filtered.length})</span>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <Input type="search" aria-label="Rechercher une variante" placeholder="Variante, option ou SKU…" value={search} onChange={(event) => setSearch(event.target.value)} className="sm:max-w-64" />
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger aria-label="Filtrer par produit" className={`${fieldClassName} max-w-64`}>
            <SelectValue placeholder="Filtrer par produit…" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
            <SelectItem value="all">Tous les produits</SelectItem>
            {products.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name} · {id}
              </SelectItem>
            ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucune variante pour ce filtre.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm sm:min-w-[860px]">
            <caption className="sr-only">Soldes et quarantaine par variante</caption>
            <thead className="sr-only sm:not-sr-only">
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Produit</th>
                <th className="py-2 pr-4 font-medium">Variante / SKU</th>
                <th className="py-2 pr-4 text-right font-medium">Physique</th>
                <th className="py-2 pr-4 text-right font-medium">Quarantaine</th>
                <th className="py-2 pr-4 text-right font-medium">Réservé</th>
                <th className="py-2 pr-4 text-right font-medium">Disponible</th>
                <th className="py-2 pr-4 font-medium">État</th>
                {isAdmin ? <th className="py-2 text-right font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const state = stateFor(row.available);
                return (
                  <tr
                    key={row.variantId}
                    className="grid grid-cols-2 gap-x-3 border-b border-border/50 py-3 last:border-0 hover:bg-muted/40 sm:table-row sm:py-0"
                  >
                    <td className="col-span-2 py-2 sm:pr-4">{row.productName}</td>
                    <td className="col-span-2 min-w-0 py-2 sm:pr-4"><StockVariantIdentity row={row} /></td>
                    <td className="py-2 sm:pr-4 sm:text-right"><span className="text-muted-foreground sm:hidden">Physique : </span>{row.physical}</td>
                    <td className="py-2 text-[var(--crm-warning)] sm:pr-4 sm:text-right">
                      <span className="sm:hidden">Quarantaine : </span>
                      {row.quarantine}
                    </td>
                    <td className="py-2 text-[var(--crm-info)] sm:pr-4 sm:text-right"><span className="sm:hidden">Réservé : </span>{row.reserved}</td>
                    <td className="py-2 font-semibold sm:pr-4 sm:text-right">
                      <span className="sm:hidden">Disponible : </span>
                      {row.available}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${state.className}`}
                      >
                        {state.label}
                      </span>
                    </td>
                    {isAdmin ? (
                      <td className="py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => openAdjust(row)}
                        >
                               <SlidersHorizontalIcon data-icon="inline-start" aria-hidden />
                          Quarantaine
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={adjusting !== null}
        onOpenChange={(open) => {
          if (!open) closeAdjust();
        }}
      >
        <DialogContent className="border border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>Ajuster la quarantaine</DialogTitle>
            <DialogDescription>
              {adjusting
                ? `${adjusting.sku} — ${adjusting.productName} (${adjusting.label || "Standard"}) · physique ${adjusting.physical}, quarantaine ${adjusting.quarantine}, réservé ${adjusting.reserved}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy || uncertain} className="grid gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-quarantine" className="text-foreground">
                Delta quarantaine (+/−)
              </Label>
              <Input
                id="adjust-quarantine"
                type="number"
                inputMode="numeric"
                placeholder="Ex. 1"
                value={quarantineDelta}
                onChange={(event) => setQuarantineDelta(event.target.value)}
                className={fieldClassName}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-reason" className="text-foreground">
                Motif (obligatoire)
              </Label>
              <Textarea
                id="adjust-reason"
                rows={2}
                maxLength={500}
                required
                placeholder="Ex. unité abîmée constatée en rayon…"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={fieldClassName}
              />
            </div>
          </fieldset>
          {message && <p role="alert" className="text-sm text-[var(--crm-warning)]">{message}</p>}
          {uncertain && <p role="alert" className="text-sm text-muted-foreground">Résultat non confirmé. Les quantités, le motif et l’identifiant sont conservés pour une nouvelle tentative sans doublon.</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeAdjust}
              disabled={busy || uncertain}
            >
              Annuler
            </Button>
            <Button type="button" onClick={onAdjust} disabled={busy}>
              {busy ? "Enregistrement…" : uncertain ? "Réessayer le même ajustement" : "Enregistrer l'ajustement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// --- Journal des mouvements (audit).

export function MovementsAudit({ movements }: { movements: StockMovementRow[] }) {
  const [variantFilter, setVariantFilter] = useState("");
  const [orderFilter, setOrderFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("all");

  const filtered = movements.filter((movement) => {
    if (variantFilter.trim()) {
      const needle = variantFilter.trim().toLowerCase();
      if (!movement.variantLabel.toLowerCase().includes(needle)) return false;
    }
    if (orderFilter.trim()) {
      if (!(movement.orderId ?? "").toLowerCase().includes(orderFilter.trim().toLowerCase())) {
        return false;
      }
    }
    if (kindFilter !== "all" && movement.kind !== kindFilter) return false;
    return true;
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Journal des mouvements
            <span className="text-muted-foreground/70"> ({movements.length})</span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            200 derniers mouvements au maximum · l&apos;historique affiché est limité aux opérations récentes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={variantFilter}
            onChange={(event) => setVariantFilter(event.target.value)}
            placeholder="Filtrer par variante / SKU…"
            aria-label="Filtrer par variante"
            className={`${fieldClassName} max-w-52`}
          />
          <Input
            type="search"
            value={orderFilter}
            onChange={(event) => setOrderFilter(event.target.value)}
            placeholder="N° commande…"
            aria-label="Filtrer par commande"
            className={`${fieldClassName} max-w-44`}
          />
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger aria-label="Filtrer par type de mouvement" className={`${fieldClassName} max-w-48`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
              <SelectItem value="all">Tous les types</SelectItem>
              {Object.entries(MOVEMENT_KIND_LABELS).map(([kind, label]) => (
                <SelectItem key={kind} value={kind}>
                  {label}
                </SelectItem>
              ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          <p>Aucun mouvement ne correspond à ces filtres.</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Rappel : seuls les 200 derniers mouvements au maximum sont consultables ici.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Variante</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 text-right font-medium">Qté</th>
                <th className="py-2 pr-4 font-medium">Motif</th>
                <th className="py-2 pr-4 font-medium">Commande</th>
                <th className="py-2 pr-4 font-medium">Acteur</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 font-medium">Réf</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((movement) => (
                <tr
                  key={movement.id}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/40"
                >
                  <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                    {movement.dateLabel}
                  </td>
                  <td className="max-w-[260px] py-2 pr-4 text-muted-foreground">
                    <span className="break-words">{movement.variantLabel}</span>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-foreground">
                    {MOVEMENT_KIND_LABELS[movement.kind] ?? movement.kind}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <QtyCell qty={movement.qty} />
                  </td>
                  <td className="max-w-[220px] py-2 pr-4 text-muted-foreground">
                    <span className="break-words">{movement.reason ?? "—"}</span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                    {movement.orderId ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{movement.actor}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground/80">{movement.source}</td>
                  <td className="py-2 font-mono text-[11px] text-muted-foreground/60">
                    {movement.ref}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
