"use client";

import { useCallback, useRef } from "react";
import type { CommerceTotals, CommerceUpsellOffer } from "@/lib/commerce-types";
import { newEventId, readAttribution } from "@/lib/storefront/track";
import { normalizeMaPhoneClient } from "./phone";
import type { FunnelProps } from "./funnel-props";

const TIMEOUT_MS = 15_000;

export interface CheckoutSuccess {
  ok: true;
  orderId: string;
  totals: CommerceTotals;
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

interface StoredKey { key: string; payload: string; eventId: string }

function readJson<T>(key: string): T | null {
  try { const raw = sessionStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function writeJson(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
function removeKey(key: string) {
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
  ): Promise<CheckoutResult> => {
    const phone = normalizeMaPhoneClient(input.phone);
    if (!phone) return { ok: false, status: 400, code: "INVALID_PHONE", uncertain: false };
    const items = input.items.map((i) => ({ variantId: i.variantId, qty: i.qty }))
      .sort((a, b) => a.variantId.localeCompare(b.variantId));
    const payload = JSON.stringify({ name: input.name.trim(), phone, items });
    let stored = readJson<StoredKey>(checkoutKey);
    if (!stored || stored.payload !== payload) {
      stored = { key: crypto.randomUUID(), payload, eventId: newEventId() };
      writeJson(checkoutKey, stored);
    }
    const result = await post("/api/store/checkout", {
      requestKey: stored.key,
      customer: { name: input.name.trim(), phone },
      items,
      attribution: { eventId: stored.eventId, sourceUrl: location.origin + location.pathname, ...readAttribution() },
    });
    if (result === "timeout") return { ok: false, status: 0, code: "TIMEOUT", uncertain: true };
    if ((result.status === 200 || result.status === 201) && result.data) {
      const data = result.data as { orderId: string; totals: CommerceTotals; upsellOffer: CommerceUpsellOffer | null };
      removeKey(checkoutKey);
      const productIds = [...new Set(input.items.map((i) => i.productId).filter((id): id is string => !!id))];
      firePurchase(data.totals, productIds, stored.eventId);
      return { ok: true, orderId: data.orderId, totals: data.totals, upsellOffer: data.upsellOffer ?? null };
    }
    // 5xx may have committed server-side: keep the key. 4xx are definitive rejections.
    return {
      ok: false, status: result.status, code: errorCode(result.data),
      ...(result.retryAfter ? { retryAfter: result.retryAfter } : {}),
      uncertain: result.status >= 500,
    };
  }, [checkoutKey]);

  /** Double clicks share one in-flight request. */
  const submit = useCallback((input: Parameters<typeof run>[0]): Promise<CheckoutResult> => {
    if (inflight.current) return inflight.current;
    const promise = run(input).finally(() => { inflight.current = null; });
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
