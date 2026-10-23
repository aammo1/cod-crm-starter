"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPrice, t } from "@/config/i18n";
import { useFunnel, writePendingOrder } from "@/stores/funnel";
import type { FunnelProps } from "./funnel-props";
import { useCheckout } from "./use-checkout";

const RING = 2 * Math.PI * 18;

export default function UpsellModal({ locale, storeSlug }: FunnelProps) {
  const router = useRouter();
  const order = useFunnel((s) => s.order);
  const offer = useFunnel((s) => s.offer);
  const close = useFunnel((s) => s.close);
  const { accept, decline } = useCheckout({ storeSlug });
  const firstAvailable = offer?.variants.find((v) => v.available)?.variantId ?? null;
  const [variantId, setVariantId] = useState<string | null>(firstAvailable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const finished = useRef(false);
  const inFlight = useRef(false);
  const [totalMs] = useState(() => (offer ? Math.max(1, new Date(offer.expiresAt).getTime() - Date.now()) : 1));
  const [remainingMs, setRemainingMs] = useState(totalMs);

  function leave() {
    close();
    router.push("/merci");
  }

  function declineAndLeave() {
    if (finished.current || inFlight.current || !order) return;
    finished.current = true;
    void decline(order.orderId); // fire and forget
    leave();
  }

  const expiresAt = offer ? new Date(offer.expiresAt).getTime() : 0;
  useEffect(() => {
    if (!offer) return;
    const timer = setInterval(() => {
      const left = expiresAt - Date.now();
      setRemainingMs(Math.max(0, left));
      if (left <= 0) { clearInterval(timer); declineAndLeave(); }
    }, 250);
    return () => clearInterval(timer);
    // declineAndLeave only reads refs and stable store values for this order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer, expiresAt]);

  if (!offer || !order) return null;

  async function onAccept() {
    if (busy || finished.current || !variantId || !offer || !order) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    const result = await accept(order.orderId, variantId);
    inFlight.current = false;
    if (result.ok) {
      finished.current = true;
      const variant = offer.variants.find((v) => v.variantId === variantId);
      writePendingOrder(storeSlug, {
        orderId: order.orderId,
        totals: result.totals ?? order.totals,
        lines: [...order.lines, { name: offer.name, optionsLabel: variant?.label ?? "", qty: 1, unitPrice: offer.upsellPrice }],
      });
      leave();
      return;
    }
    if (result.status === 409) { finished.current = true; leave(); return; } // offer already closed
    setBusy(false);
    setError(true);
    // Countdown may have expired while the accept was pending: decline now.
    if (expiresAt <= Date.now()) declineAndLeave();
  }

  const seconds = Math.ceil(remainingMs / 1000);
  const dash = RING * (1 - remainingMs / totalMs);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) declineAndLeave(); }}>
      <DialogContent className="bg-store-bg text-store-fg sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t(locale, "upsellTitle")}</DialogTitle>
          <DialogDescription>{t(locale, "upsellEndsIn", { s: seconds })}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          {offer.image ? (
            <Image src={offer.image} alt={offer.name} width={96} height={96} className="size-24 shrink-0 rounded-store object-cover" />
          ) : <div className="size-24 shrink-0 rounded-store bg-store-muted" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{offer.name}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <s className="text-sm tabular-nums opacity-60">{formatPrice(locale, offer.originalPrice)}</s>
              <strong className="text-lg tabular-nums text-store-accent">{formatPrice(locale, offer.upsellPrice)}</strong>
            </p>
          </div>
          <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0 -rotate-90" role="img"
            aria-label={t(locale, "upsellEndsIn", { s: seconds })}>
            <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" className="stroke-store-muted" />
            <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" strokeLinecap="round"
              className="stroke-store-accent" strokeDasharray={RING} strokeDashoffset={dash} />
            <text x="22" y="22" textAnchor="middle" dominantBaseline="central" className="rotate-90 origin-center fill-current text-[11px] tabular-nums"
              style={{ transformBox: "fill-box" }}>{seconds}</text>
          </svg>
        </div>

        {offer.variants.length > 1 && (
          <div role="radiogroup" aria-label={t(locale, "chooseOption", { name: offer.name })} className="flex flex-wrap gap-2">
            {offer.variants.map((v) => (
              <button key={v.variantId} type="button" role="radio" aria-checked={variantId === v.variantId}
                disabled={!v.available} onClick={() => setVariantId(v.variantId)}
                className={`rounded-store border px-3 py-1.5 text-sm disabled:opacity-40 disabled:line-through ${
                  variantId === v.variantId ? "border-store-primary bg-store-primary text-store-primary-fg" : "border-store-border"}`}>
                {v.label}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive" role="alert">{t(locale, "genericError")}</p>}

        <div className="flex flex-col gap-2">
          <Button type="button" size="lg" disabled={busy || !variantId} onClick={onAccept}
            className="w-full bg-store-primary text-store-primary-fg">
            {busy ? t(locale, "sending") : t(locale, "upsellAccept")}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={declineAndLeave}>
            {t(locale, "upsellDecline")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
