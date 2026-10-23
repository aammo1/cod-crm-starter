import { AlertCircleIcon, AlertTriangleIcon, InfoIcon, PlusIcon, Trash2Icon } from "lucide-react";

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
import { formatMad } from "@/lib/pricing";
import {
  fieldClassName,
  type OrderLineItem,
  type SerializableProduct,
  type SerializableVariant,
} from "./types";

export function LineItems({
  products,
  filteredProducts,
  productSearch,
  setProductSearch,
  lines,
  productsMap,
  getLineVariant,
  variantTotals,
  clientErrors,
  isSubmitting,
  handleAddLine,
  handleRemoveLine,
  handleProductChange,
  handleVariantChange,
  handleQuantityChange,
}: {
  products: SerializableProduct[];
  filteredProducts: SerializableProduct[];
  productSearch: string;
  setProductSearch: (value: string) => void;
  lines: OrderLineItem[];
  productsMap: Map<string, SerializableProduct>;
  getLineVariant: (line: OrderLineItem) => SerializableVariant | undefined;
  variantTotals: Map<string, number>;
  clientErrors: Record<string, string>;
  isSubmitting: boolean;
  handleAddLine: () => void;
  handleRemoveLine: (index: number) => void;
  handleProductChange: (index: number, productId: string) => void;
  handleVariantChange: (index: number, variantId: string) => void;
  handleQuantityChange: (index: number, qty: number) => void;
}) {
  return (
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
  );
}
