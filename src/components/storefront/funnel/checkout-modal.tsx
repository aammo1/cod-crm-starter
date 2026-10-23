"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice, t } from "@/config/i18n";
import { useCart, useCartApi } from "@/stores/cart-provider";
import { useFunnel, writePendingOrder } from "@/stores/funnel";
import { estimateTotals } from "./estimate";
import type { FunnelProps } from "./funnel-props";
import { normalizeMaPhoneClient } from "./phone";
import { useCheckout } from "./use-checkout";

export default function CheckoutModal(props: FunnelProps) {
  const { locale, storeSlug, shippingFeeMad, freeShippingThresholdMad } = props;
  const router = useRouter();
  const cartApi = useCartApi();
  const cartLines = useCart((s) => s.lines);
  const directItems = useFunnel((s) => s.directItems);
  const close = useFunnel((s) => s.close);
  const setStage = useFunnel((s) => s.setStage);
  const startUpsell = useFunnel((s) => s.startUpsell);
  const { submit } = useCheckout({ storeSlug });
  const lines = directItems ?? cartLines;
  const est = estimateTotals(lines, shippingFeeMad, freeShippingThresholdMad);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = t(locale, "nameRequired");
    if (!normalizeMaPhoneClient(phone)) next.phone = t(locale, "phoneInvalid");
    setErrors(next);
    if (next.name || next.phone || lines.length === 0) return;

    setBusy(true);
    try {
      const result = await submit({
        name, phone,
        items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, productId: l.productId })),
      });
      if (!result.ok) {
        if (result.code === "INVALID_VARIANT") {
          if (!directItems) cartApi.getState().clear();
          router.refresh();
          toast.error(t(locale, "genericError"));
          if (directItems) close(); else setStage("cart");
          return;
        }
        setErrors({ form: result.status === 429 ? t(locale, "retryLater") : t(locale, "genericError") });
        return;
      }
      const order = {
        orderId: result.orderId,
        totals: result.totals,
        lines: lines.map((l) => ({ name: l.name, optionsLabel: l.optionsLabel, qty: l.qty, unitPrice: l.unitPrice })),
      };
      writePendingOrder(storeSlug, order);
      const offer = result.upsellOffer;
      if (offer && new Date(offer.expiresAt).getTime() > Date.now()) {
        if (!directItems) cartApi.getState().clear();
        startUpsell(order, offer);
        return;
      }
      if (!directItems) cartApi.getState().clear();
      close();
      router.push("/merci");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) close(); }}>
      <DialogContent className="bg-store-bg text-store-fg sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t(locale, "confirmOrder")}</DialogTitle>
          <DialogDescription>{t(locale, "cod")}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-2">
              <span className="truncate">{l.qty} × {l.name}{l.optionsLabel ? ` (${l.optionsLabel})` : ""}</span>
              <span className="tabular-nums">{formatPrice(locale, l.unitPrice * l.qty)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-store-border pt-1 font-semibold">
            <span>{t(locale, "total")}</span><span className="tabular-nums">{formatPrice(locale, est.total)}</span>
          </li>
        </ul>

        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="checkout-name">{t(locale, "fullName")}</Label>
            <Input id="checkout-name" name="name" autoComplete="name" value={name} maxLength={80}
              aria-invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <p className="text-xs text-destructive" role="alert">{errors.name}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="checkout-phone">{t(locale, "phone")}</Label>
            <Input id="checkout-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr"
              placeholder={t(locale, "phonePlaceholder")} value={phone} maxLength={20}
              aria-invalid={!!errors.phone} onChange={(e) => setPhone(e.target.value)} />
            {errors.phone && <p className="text-xs text-destructive" role="alert">{errors.phone}</p>}
          </div>
          {errors.form && <p className="text-sm text-destructive" role="alert">{errors.form}</p>}
          <Button type="submit" size="lg" disabled={busy || lines.length === 0}
            className="w-full bg-store-primary text-store-primary-fg">
            {busy ? t(locale, "sending") : t(locale, "confirmOrder")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
