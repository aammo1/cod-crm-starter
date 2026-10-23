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
import { describeFailure, type FailureLabels, type FailureView } from "./checkout-attempt";
import { useCheckout, useCooldown } from "./use-checkout";
import { useLeadCapture } from "./use-lead-capture";

export default function CheckoutModal(props: FunnelProps) {
  const { locale, storeSlug, shippingFeeMad, freeShippingThresholdMad, leadsEnabled } = props;
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
  const [done, setDone] = useState(false);
  const [fail, setFail] = useState<FailureView | null>(null);
  const cooldown = useCooldown();
  const failureLabels: FailureLabels = {
    genericError: t(locale, "genericError"), phoneInvalid: t(locale, "phoneInvalid"),
    phoneRecentlyOrdered: t(locale, "phoneRecentlyOrdered"), retryLaterSeconds: t(locale, "retryLaterSeconds"),
    checkoutUncertain: t(locale, "checkoutUncertain"), checkoutUncertainLocked: t(locale, "checkoutUncertainLocked"),
  };

  useLeadCapture(leadsEnabled, name, phone, lines.map((l) => ({ variantId: l.variantId, qty: l.qty })), busy || done);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(false);
  }

  async function send(resubmitStored: boolean) {
    if (busy || cooldown.remaining > 0) return;
    if (!resubmitStored) {
      const next: typeof errors = {};
      if (name.trim().length < 2) next.name = t(locale, "nameRequired");
      if (!normalizeMaPhoneClient(phone)) next.phone = t(locale, "phoneInvalid");
      setErrors(next);
      if (next.name || next.phone || lines.length === 0) return;
    }
    setErrors({});
    setFail(null);

    setBusy(true);
    try {
      const result = await submit({
        name, phone,
        items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, productId: l.productId })),
      }, { resubmitStored });
      if (!result.ok) {
        if (result.code === "INVALID_VARIANT") {
          if (!directItems) cartApi.getState().clear();
          router.refresh();
          toast.error(t(locale, "genericError"));
          if (directItems) close(); else setStage("cart");
          return;
        }
        const view = describeFailure(result, failureLabels);
        if (view.phoneField) setErrors({ phone: view.message });
        else setFail(view);
        if (view.cooldown) cooldown.start(view.cooldown);
        return;
      }
      setDone(true);
      // Display the lines actually submitted (a retried uncertain attempt may differ from the form).
      const submitted = new Map(result.items.map((i) => [i.variantId, i.qty]));
      const shown = lines.filter((l) => submitted.has(l.variantId)).map((l) => ({ ...l, qty: submitted.get(l.variantId) ?? l.qty }));
      const order = {
        orderId: result.orderId,
        totals: result.totals,
        lines: (shown.length ? shown : lines).map((l) => ({ name: l.name, optionsLabel: l.optionsLabel, qty: l.qty, unitPrice: l.unitPrice })),
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
          {est.discount > 0 && (
            <li className="flex justify-between text-store-accent">
              <span>{t(locale, "packDiscount")}</span><span className="tabular-nums">-{formatPrice(locale, est.discount)}</span>
            </li>
          )}
          <li className="flex justify-between">
            <span>{t(locale, "shipping")}</span>
            <span className="tabular-nums">{est.shipping === 0 ? t(locale, "freeShipping") : formatPrice(locale, est.shipping)}</span>
          </li>
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
            {leadsEnabled && <p className="text-xs opacity-70">{t(locale, "leadNotice")}</p>}
          </div>
          {errors.form && <p className="text-sm text-destructive" role="alert">{errors.form}</p>}
          {fail && (
            <div className="space-y-2 text-sm" role="alert">
              <p className="text-destructive">{cooldown.remaining > 0 && fail.cooldown
                ? failureLabels.retryLaterSeconds.split("{s}").join(String(cooldown.remaining)) : fail.message}</p>
              {(fail.retry || fail.whatsapp) && (
                <div className="flex flex-wrap gap-2">
                  {fail.retry && (
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void send(true)}>
                      {t(locale, "errorRetry")}
                    </Button>
                  )}
                  {fail.whatsapp && (
                    <a href={`https://wa.me/${props.whatsapp}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-9 items-center rounded-store border border-store-border px-3">
                      {t(locale, "contactWhatsapp")}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
          <Button type="submit" size="lg" disabled={busy || lines.length === 0 || cooldown.remaining > 0}
            className="w-full bg-store-primary text-store-primary-fg">
            {busy ? t(locale, "sending") : t(locale, "confirmOrder")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
