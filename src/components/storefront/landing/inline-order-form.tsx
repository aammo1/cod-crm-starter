"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { LandingLabels } from "@/config/i18n";
import type { ProductOptionDefinition, ProductPack, PublicCommerceVariant } from "@/lib/commerce-types";
import { applyPacks } from "@/lib/pack-pricing";
import { track } from "@/lib/storefront/track";
import { useFunnel, writePendingOrder } from "@/stores/funnel";
import { normalizeMaPhoneClient } from "../funnel/phone";
import { describeFailure, type FailureLabels, type FailureView } from "../funnel/checkout-attempt";
import { useCheckout, useCooldown } from "../funnel/use-checkout";
import { useLeadCapture } from "../funnel/use-lead-capture";
import { fillLabel, PackSelector } from "./pack-selector";

const LANDING_TOTAL_EVENT = "storefront:landing-total";
const MAX_QTY = 10;

export interface LandingProduct {
  id: string;
  name: string;
  price: number;
  optionDefinitions: ProductOptionDefinition[];
  variants: PublicCommerceVariant[];
  packs: ProductPack[];
}

type Selection = Record<string, string>;

const matches = (v: PublicCommerceVariant, sel: Selection) =>
  Object.entries(sel).every(([name, value]) => v.options.some((o) => o.name === name && o.value === value));

function initialSelection(product: LandingProduct): Selection {
  const first = product.variants.find((v) => v.available) ?? product.variants[0];
  const sel: Selection = {};
  for (const def of product.optionDefinitions) {
    const value = first?.options.find((o) => o.name === def.name)?.value;
    if (value !== undefined) sel[def.name] = value;
  }
  return sel;
}

const FIELD = "h-12 w-full rounded-store border border-store-border bg-store-bg px-3 text-base";

export function InlineOrderForm({ product, labels, storeSlug, shippingFeeMad, freeShippingThresholdMad, whatsappHref, leads }: {
  leads?: boolean; product: LandingProduct; labels: LandingLabels; storeSlug: string; whatsappHref: string; shippingFeeMad: number; freeShippingThresholdMad: number;
}) {
  const router = useRouter();
  const startUpsell = useFunnel((s) => s.startUpsell);
  const { submit } = useCheckout({ storeSlug });
  const price = (n: number) => `${n} ${labels.currency}`;

  const packs = product.packs.filter((p) => p.price < p.quantity * product.price && p.quantity <= MAX_QTY)
    .sort((a, b) => a.quantity - b.quantity);
  const [qty, setQty] = useState(() => packs.find((p) => p.highlight)?.quantity ?? 1);
  const [perUnit, setPerUnit] = useState(false);
  const [sels, setSels] = useState<Selection[]>(() => Array.from({ length: MAX_QTY }, () => initialSelection(product)));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [fail, setFail] = useState<FailureView | null>(null);
  const cooldown = useCooldown();
  const failureLabels: FailureLabels = labels;
  const focused = useRef(false);
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track("ViewContent", [{ id: product.id, quantity: 1 }]);
  }, [product.id]);

  const hasOptions = product.optionDefinitions.length > 0;
  const unitSels = Array.from({ length: qty }, (_, i) => (perUnit ? sels[i] : sels[0]));
  const unitVariants = unitSels.map((sel) => (hasOptions ? product.variants.find((v) => matches(v, sel)) : product.variants[0]));
  const anySoldOut = unitVariants.some((v) => !v || !v.available);

  useLeadCapture(leads, name, phone, unitVariants.flatMap((v) => (v ? [{ variantId: v.id, qty: 1 }] : [])), busy || done);

  const regular = qty * product.price;
  const { discount } = applyPacks([{ productId: product.id, qty, unitPrice: product.price }], { [product.id]: packs });
  const net = regular - discount;
  const shipping = net >= freeShippingThresholdMad ? 0 : shippingFeeMad;
  const total = net + shipping;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(LANDING_TOTAL_EVENT, { detail: total }));
  }, [total]);

  function setOption(unit: number, def: string, value: string) {
    setSels((all) => all.map((s, i) => (i === unit ? { ...s, [def]: value } : s)));
  }

  function valueDisabled(sel: Selection, defName: string, value: string) {
    const others = Object.fromEntries(Object.entries(sel).filter(([k]) => k !== defName));
    return !product.variants.some((v) => v.available && matches(v, { ...others, [defName]: value }));
  }

  function onFocus() {
    if (focused.current) return;
    focused.current = true;
    track("InitiateCheckout", [{ id: product.id, quantity: qty }]);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(false);
  }

  async function send(resubmitStored: boolean) {
    if (busy || cooldown.remaining > 0) return;
    if (!resubmitStored) {
      const next: typeof errors = {};
      if (name.trim().length < 2) next.name = labels.nameRequired;
      if (!normalizeMaPhoneClient(phone)) next.phone = labels.phoneInvalid;
      setErrors(next);
      if (next.name || next.phone || anySoldOut) return;
    }
    setErrors({});
    setFail(null);

    const grouped = new Map<string, { variant: PublicCommerceVariant; qty: number }>();
    for (const v of unitVariants as PublicCommerceVariant[]) {
      const entry = grouped.get(v.id);
      if (entry) entry.qty += 1; else grouped.set(v.id, { variant: v, qty: 1 });
    }
    setBusy(true);
    try {
      const result = await submit({
        name, phone,
        items: [...grouped.values()].map((g) => ({ variantId: g.variant.id, qty: g.qty, productId: product.id })),
      }, { resubmitStored });
      if (!result.ok) {
        if (result.code === "INVALID_VARIANT") router.refresh();
        const view = describeFailure(result, failureLabels);
        if (view.phoneField) setErrors({ phone: view.message });
        else setFail(view);
        if (view.cooldown) cooldown.start(view.cooldown);
        return;
      }
      setDone(true);
      // Display the lines actually submitted (a retried uncertain attempt may differ from the form).
      const submitted = new Map(result.items.map((i) => [i.variantId, i.qty]));
      const shown = [...grouped.values()].filter((g) => submitted.has(g.variant.id))
        .map((g) => ({ ...g, qty: submitted.get(g.variant.id) ?? g.qty }));
      const order = {
        orderId: result.orderId,
        totals: result.totals,
        lines: (shown.length ? shown : [...grouped.values()]).map((g) => ({ name: product.name, optionsLabel: g.variant.label, qty: g.qty, unitPrice: product.price })),
      };
      writePendingOrder(storeSlug, order);
      const offer = result.upsellOffer;
      if (offer && new Date(offer.expiresAt).getTime() > Date.now()) {
        startUpsell(order, offer);
        return;
      }
      router.push("/merci");
    } finally {
      setBusy(false);
    }
  }

  const pickerUnits = hasOptions ? (perUnit ? qty : 1) : 0;

  return (
    <form id="commander" onSubmit={onSubmit} noValidate onFocus={onFocus}
      className="scroll-mt-4 space-y-4 rounded-store border border-store-border bg-store-bg p-4 shadow-sm">
      <PackSelector packs={packs} basePrice={product.price} qty={qty} onChange={setQty} labels={labels} />

      {Array.from({ length: pickerUnits }, (_, unit) => (
        <div key={unit} className="space-y-3">
          {perUnit && <p className="text-sm font-semibold">{fillLabel(labels.unit, { n: unit + 1 })}</p>}
          {product.optionDefinitions.map((def) => (
            <fieldset key={def.name}>
              <legend className="mb-1.5 text-sm font-medium">
                {def.name}
                {unitSels[unit]?.[def.name] && <span className="ms-1 font-normal opacity-70">: {unitSels[unit][def.name]}</span>}
              </legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label={fillLabel(labels.chooseOption, { name: def.name })}>
                {def.values.map((value) => {
                  const selected = unitSels[unit]?.[def.name] === value;
                  const disabled = valueDisabled(unitSels[unit], def.name, value);
                  return (
                    <button key={value} type="button" aria-pressed={selected}
                      onClick={() => setOption(unit, def.name, value)}
                      className={`min-h-11 min-w-11 rounded-store border px-3 text-sm ${
                        selected ? "border-store-primary bg-store-primary text-store-primary-fg" : "border-store-border"
                      } ${disabled ? "opacity-40 line-through" : ""}`}>
                      {value}
                    </button>
                  );
                })}
              </div>
              {!unitVariants[unit]?.available && <p className="mt-1 text-sm text-destructive" role="alert">{labels.soldOut}</p>}
            </fieldset>
          ))}
        </div>
      ))}
      {hasOptions && qty > 1 && (
        <button type="button" onClick={() => { if (!perUnit) setSels((all) => all.map(() => all[0])); setPerUnit((v) => !v); }} aria-expanded={perUnit}
          className="text-sm underline">
          {labels.differentOptions}
        </button>
      )}

      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="landing-name" className="text-sm font-medium">{labels.fullName}</label>
          <input id="landing-name" name="name" autoComplete="name" value={name} maxLength={80}
            aria-invalid={!!errors.name} onChange={(e) => setName(e.target.value)} className={FIELD} />
          {errors.name && <p className="text-xs text-destructive" role="alert">{errors.name}</p>}
        </div>
        <div className="space-y-1">
          <label htmlFor="landing-phone" className="text-sm font-medium">{labels.phone}</label>
          <input id="landing-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr"
            placeholder={labels.phonePlaceholder} value={phone} maxLength={20}
            aria-invalid={!!errors.phone} onChange={(e) => setPhone(e.target.value)} className={FIELD} />
          {errors.phone && <p className="text-xs text-destructive" role="alert">{errors.phone}</p>}
          {leads && <p className="text-xs opacity-70">{labels.leadNotice}</p>}
        </div>
      </div>

      <p className="text-sm opacity-80">{labels.cod}</p>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between"><dt>{labels.subtotal}</dt><dd className="tabular-nums">{price(regular)}</dd></div>
        {discount > 0 && (
          <div className="flex justify-between text-store-accent"><dt>{labels.packDiscount}</dt><dd className="tabular-nums">-{price(discount)}</dd></div>
        )}
        <div className="flex justify-between"><dt>{labels.shipping}</dt><dd className="tabular-nums">{shipping === 0 ? labels.freeShipping : price(shipping)}</dd></div>
        <div className="flex justify-between border-t border-store-border pt-1 text-base font-bold">
          <dt>{labels.total}</dt><dd className="tabular-nums">{price(total)}</dd>
        </div>
      </dl>

      {fail && (
        <div className="space-y-2 text-sm" role="alert">
          <p className="text-destructive">{cooldown.remaining > 0 && fail.cooldown
            ? labels.retryLaterSeconds.split("{s}").join(String(cooldown.remaining)) : fail.message}</p>
          {(fail.retry || fail.whatsapp) && (
            <div className="flex flex-wrap gap-2">
              {fail.retry && (
                <button type="button" disabled={busy} onClick={() => void send(true)}
                  className="h-11 rounded-store border border-store-border px-4">{labels.errorRetry}</button>
              )}
              {fail.whatsapp && (
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
                  className="inline-flex h-11 items-center rounded-store border border-store-border px-4">{labels.contactWhatsapp}</a>
              )}
            </div>
          )}
        </div>
      )}
      <button type="submit" disabled={busy || anySoldOut || cooldown.remaining > 0}
        className="h-14 w-full rounded-store bg-store-accent text-lg font-bold text-store-accent-fg disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? labels.sending : anySoldOut ? labels.soldOut : labels.confirmOrder}
      </button>
    </form>
  );
}
