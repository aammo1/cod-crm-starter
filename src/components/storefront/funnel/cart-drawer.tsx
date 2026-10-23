"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Minus, Plus, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { formatPrice, pieces, t } from "@/config/i18n";
import type { ProductPack } from "@/lib/commerce-types";
import { track } from "@/lib/storefront/track";
import { MAX_LINE_QTY } from "@/stores/cart";
import { useCart } from "@/stores/cart-provider";
import { useFunnel } from "@/stores/funnel";
import { estimateTotals } from "./estimate";
import type { FunnelProps } from "./funnel-props";

interface CrossSell { id: string; slug: string; name: string; price: number; image: string; variantId: string | null; packs: ProductPack[] }

export default function CartDrawer({ locale, shippingFeeMad, freeShippingThresholdMad }: FunnelProps) {
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const add = useCart((s) => s.add);
  const setStage = useFunnel((s) => s.setStage);
  const close = useFunnel((s) => s.close);
  const [crossSells, setCrossSells] = useState<CrossSell[]>([]);
  const est = estimateTotals(lines, shippingFeeMad, freeShippingThresholdMad);
  const net = est.subtotal - est.discount;
  const remaining = Math.max(0, freeShippingThresholdMad - net);
  const progress = freeShippingThresholdMad > 0 ? Math.min(100, (net / freeShippingThresholdMad) * 100) : 100;

  const excludeKey = [...new Set(lines.map((l) => l.productId))].sort().join(",");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/store/cross-sells?exclude=${encodeURIComponent(excludeKey)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { products?: CrossSell[] } | CrossSell[] | null) => {
        const list = Array.isArray(data) ? data : data?.products ?? [];
        setCrossSells(list.filter((p) => p.variantId).slice(0, 3));
      })
      .catch(() => {});
    return () => controller.abort();
    // Fetched when the drawer opens; membership changes refresh the exclusion list.
  }, [excludeKey]);

  const visibleCrossSells = crossSells.filter((p) => !excludeKey.split(",").includes(p.id));

  return (
    <Sheet open onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent
        side={locale === "ar" ? "left" : "right"}
        className="bg-store-bg text-store-fg"
      >
        <SheetHeader>
          <SheetTitle className="font-heading">{t(locale, "cart")}</SheetTitle>
          <SheetDescription className="sr-only">{t(locale, "cart")}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-sm opacity-70">{t(locale, "cartEmpty")}</p>
          ) : (
            <>
              {freeShippingThresholdMad > 0 && (
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-store-muted" role="progressbar"
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
                    <div className="h-full rounded-full bg-store-accent transition-[width] duration-500" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs">
                    <Truck className="size-3.5" aria-hidden />
                    {remaining === 0 ? t(locale, "freeShipping")
                      : t(locale, "freeShippingProgress", { amount: formatPrice(locale, remaining) })}
                  </p>
                </div>
              )}

              <ul className="space-y-3">
                {lines.map((line) => (
                  <li key={line.variantId} className="flex gap-3 rounded-store border border-store-border p-2">
                    {line.image ? (
                      <Image src={line.image} alt={line.name} width={64} height={64}
                        className="size-16 shrink-0 rounded-store object-cover" />
                    ) : <div className="size-16 shrink-0 rounded-store bg-store-muted" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{line.name}</p>
                      {line.optionsLabel && <p className="truncate text-xs opacity-70">{line.optionsLabel}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="outline" size="icon-sm" aria-label={t(locale, "decrease")}
                            disabled={line.qty <= 1} onClick={() => setQty(line.variantId, line.qty - 1)}>
                            <Minus />
                          </Button>
                          <span className="w-6 text-center text-sm tabular-nums" aria-label={t(locale, "quantity")}>{line.qty}</span>
                          <Button type="button" variant="outline" size="icon-sm" aria-label={t(locale, "increase")}
                            disabled={line.qty >= MAX_LINE_QTY} onClick={() => setQty(line.variantId, line.qty + 1)}>
                            <Plus />
                          </Button>
                        </div>
                        <span className="text-sm font-semibold tabular-nums">{formatPrice(locale, line.unitPrice * line.qty)}</span>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={t(locale, "remove")}
                          onClick={() => remove(line.variantId)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {est.applications.map((app) => (
                <p key={app.productId} className="rounded-store bg-store-accent/10 px-3 py-2 text-xs font-medium">
                  {pieces(locale, app.quantity)} : {t(locale, "save", { amount: formatPrice(locale, app.discount) })}
                </p>
              ))}
            </>
          )}

          {visibleCrossSells.length > 0 && (
            <section aria-label={t(locale, "youMayLike")}>
              <h3 className="mb-2 font-heading text-sm font-semibold">{t(locale, "youMayLike")}</h3>
              <ul className="space-y-2">
                {visibleCrossSells.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-store border border-store-border p-2">
                    {p.image ? (
                      <Image src={p.image} alt={p.name} width={48} height={48} className="size-12 shrink-0 rounded-store object-cover" />
                    ) : <div className="size-12 shrink-0 rounded-store bg-store-muted" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{p.name}</p>
                      <p className="text-xs tabular-nums opacity-70">{formatPrice(locale, p.price)}</p>
                    </div>
                    <Button type="button" variant="outline" size="icon-sm" aria-label={t(locale, "addToCart")}
                      onClick={() => p.variantId && add({
                        variantId: p.variantId, productId: p.id, slug: p.slug, name: p.name,
                        image: p.image, optionsLabel: "", unitPrice: p.price, packs: p.packs,
                      })}>
                      <Plus />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {lines.length > 0 && (
          <SheetFooter className="border-t border-store-border">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt>{t(locale, "subtotal")}</dt><dd className="tabular-nums">{formatPrice(locale, est.subtotal)}</dd></div>
              {est.discount > 0 && (
                <div className="flex justify-between font-medium"><dt>{t(locale, "save", { amount: formatPrice(locale, est.discount) })}</dt><dd className="tabular-nums">−{formatPrice(locale, est.discount)}</dd></div>
              )}
              <div className="flex justify-between"><dt>{t(locale, "shipping")}</dt>
                <dd className="tabular-nums">{est.shipping === 0 ? t(locale, "freeShipping") : formatPrice(locale, est.shipping)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>{t(locale, "total")}</dt><dd className="tabular-nums">{formatPrice(locale, est.total)}</dd></div>
            </dl>
            <Button type="button" size="lg" className="w-full bg-store-primary text-store-primary-fg"
              onClick={() => {
                track("InitiateCheckout", lines.map((l) => ({ id: l.productId, quantity: l.qty })));
                setStage("checkout");
              }}>
              {t(locale, "checkout")}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
