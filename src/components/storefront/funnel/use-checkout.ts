"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommerceTotals, CommerceUpsellOffer } from "@/lib/commerce-types";
import { newEventId, readAttribution, readFirstTouch } from "@/lib/storefront/track";
import { attemptOutcome, decideAttempt, type StoredAttempt } from "./checkout-attempt";
import { normalizeMaPhoneClient } from "./phone";
import type { FunnelProps } from "./funnel-props";

const TIMEOUT_MS = 15_000;

export interface CheckoutSuccess {
  ok: true;
  orderId: string;
  totals: CommerceTotals;
  /** Items actually submitted (the stored payload when an uncertain attempt was retried). */
  items: { variantId: string; qty: number }[];
  upsellOffer: CommerceUpsellOffer | null;
}
export interface CheckoutFailure {
  ok: false;
  status: number;
  code: string;
  retryAfter?: number;
  /** True when the outcome is unknown (timeout/network). The same key must be reused. */
  uncertain: boolean;
}
export type CheckoutResult = CheckoutSuccess | CheckoutFailure;

export interface UpsellResult { ok: boolean; status: number; totals?: CommerceTotals }

/** Seconds left on a server-imposed wait; `start` begins a countdown. */
export function useCooldown() {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  return { remaining, start: setRemaining };
}

function readJson<T>(key: string): T | null {
  try { const raw = sessionStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function writeJson(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
function readAttempt(key: string): StoredAttempt | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<StoredAttempt> | null;
    return v && typeof v.key === "string" && typeof v.payload === "string" && typeof v.eventId === "string"
      ? { key: v.key, payload: v.payload, eventId: v.eventId, uncertain: v.uncertain === true, createdAt: Number(v.createdAt) || Date.now() }
      : null;
  } catch { return null; }
}
function writeAttempt(key: string, value: StoredAttempt) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
function removeKey(key: string) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  try { sessionStorage.removeItem(key); } catch { /* storage unavailable */ }
}

async function post(url: string, body: unknown): Promise<{ status: number; data: unknown; retryAfter?: number } | "timeout"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    const retry = Number(response.headers.get("retry-after"));
    return { status: response.status, data, ...(Number.isFinite(retry) && retry > 0 ? { retryAfter: retry } : {}) };
  } catch {
    return "timeout";
  } finally {
    clearTimeout(timer);
  }
}

function errorCode(data: unknown): string {
  const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === "string" ? code : "UNKNOWN";
}

function firePurchase(totals: CommerceTotals, ids: string[], eventId: string) {
  try {
    window.fbq?.("track", "Purchase",
      { value: totals.total, currency: "MAD", content_ids: ids, content_type: "product" }, { eventID: eventId });
    window.ttq?.track("CompletePayment", {
      value: totals.total, currency: "MAD",
      contents: ids.map((id) => ({ content_id: id, content_type: "product" })),
    }, { event_id: eventId });
  } catch { /* Tracking must never interrupt shopping. */ }
}

export function useCheckout({ storeSlug }: Pick<FunnelProps, "storeSlug">) {
  const inflight = useRef<Promise<CheckoutResult> | null>(null);
  const checkoutKey = `${storeSlug}-checkout-key`;

  const run = useCallback(async (
    input: { name: string; phone: string; items: { variantId: string; qty: number; productId?: string }[] },
    options?: { resubmitStored?: boolean },
  ): Promise<CheckoutResult> => {
    const phone = normalizeMaPhoneClient(input.phone);
    const items = input.items.map((i) => ({ variantId: i.variantId, qty: i.qty }))
      .sort((a, b) => a.variantId.localeCompare(b.variantId));
    // First-touch attribution lives in the stored payload so retries resend identical data.
    const payload = JSON.stringify({ name: input.name.trim(), phone, items, attr: readFirstTouch() });
    const existing = readAttempt(checkoutKey);
    // An explicit retry of an uncertain attempt submits the stored payload, whatever the form says.
    if (!(options?.resubmitStored && existing?.uncertain) && !phone) {
      return { ok: false, status: 400, code: "INVALID_PHONE", uncertain: false };
    }
    const decision = decideAttempt(existing, payload, Date.now(), () => ({ key: crypto.randomUUID(), eventId: newEventId() }));
    if (decision.locked && !options?.resubmitStored) {
      return { ok: false, status: 0, code: "UNCERTAIN_LOCKED", uncertain: true };
    }
    const stored = decision.attempt;
    if (decision.fresh) writeAttempt(checkoutKey, stored);
    const sent = JSON.parse(stored.payload) as { name: string; phone: string; items: { variantId: string; qty: number }[]; attr?: Record<string, string> };
    const outcome = (status: number, code: string): void => {
      const o = attemptOutcome(status, code);
      if (o === "clear") removeKey(checkoutKey);
      else if (o === "uncertain") writeAttempt(checkoutKey, { ...stored, uncertain: true });
    };
    const result = await post("/api/store/checkout", {
      requestKey: stored.key,
      customer: { name: sent.name, phone: sent.phone },
      items: sent.items,
      attribution: { eventId: stored.eventId, sourceUrl: location.origin + location.pathname, ...readAttribution(), ...sent.attr },
    });
    if (result === "timeout") { outcome(0, "TIMEOUT"); return { ok: false, status: 0, code: "TIMEOUT", uncertain: true }; }
    if ((result.status === 200 || result.status === 201) && result.data) {
      const data = result.data as { orderId: string; totals: CommerceTotals; upsellOffer: CommerceUpsellOffer | null };
      removeKey(checkoutKey);
      const productIds = [...new Set(input.items.map((i) => i.productId).filter((id): id is string => !!id))];
      firePurchase(data.totals, productIds, stored.eventId);
      return { ok: true, orderId: data.orderId, totals: data.totals, items: sent.items, upsellOffer: data.upsellOffer ?? null };
    }
    // 5xx may have committed server-side: keep the key and lock the payload. Other 4xx are definitive
    // except 408/409/429, which never rotate the key (see attemptOutcome).
    const code = errorCode(result.data);
    outcome(result.status, code);
    const bodyRetry = Number((result.data as { error?: { retryAfter?: unknown } } | null)?.error?.retryAfter);
    const retryAfter = result.retryAfter ?? (Number.isFinite(bodyRetry) && bodyRetry > 0 ? bodyRetry : undefined);
    return {
      ok: false, status: result.status, code,
      ...(retryAfter ? { retryAfter } : {}),
      uncertain: result.status >= 500,
    };
  }, [checkoutKey]);

  /** Double clicks share one in-flight request. */
  const submit = useCallback((input: Parameters<typeof run>[0], options?: Parameters<typeof run>[1]): Promise<CheckoutResult> => {
    if (inflight.current) return inflight.current;
    const promise = run(input, options).finally(() => { inflight.current = null; });
    inflight.current = promise;
    return promise;
  }, [run]);

  const resolveUpsell = useCallback(async (
    orderId: string, action: "accept" | "decline", variantId?: string,
  ): Promise<UpsellResult> => {
    const name = `${storeSlug}-upsell-key-${orderId}-${action}${variantId ? `-${variantId}` : ""}`;
    let key = readJson<string>(name);
    if (!key) { key = crypto.randomUUID(); writeJson(name, key); }
    const result = await post(`/api/store/orders/${encodeURIComponent(orderId)}/upsell`,
      action === "accept" ? { requestKey: key, action, variantId } : { requestKey: key, action });
    if (result === "timeout") return { ok: false, status: 0 };
    const totals = (result.data as { totals?: CommerceTotals } | null)?.totals;
    return { ok: result.status >= 200 && result.status < 300, status: result.status, ...(totals ? { totals } : {}) };
  }, [storeSlug]);

  const accept = useCallback((orderId: string, variantId: string) => resolveUpsell(orderId, "accept", variantId), [resolveUpsell]);
  const decline = useCallback((orderId: string) => resolveUpsell(orderId, "decline"), [resolveUpsell]);

  return { submit, accept, decline };
}
