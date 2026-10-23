"use client";

import { create } from "zustand";
import type { CommerceTotals, CommerceUpsellOffer } from "@/lib/commerce-types";
import type { CartLine } from "./cart";

export type FunnelStage = "idle" | "cart" | "checkout" | "upsell";

export interface PendingOrder {
  orderId: string;
  totals: CommerceTotals;
  lines: { name: string; optionsLabel: string; qty: number; unitPrice: number }[];
}

interface FunnelState {
  stage: FunnelStage;
  /** Items for a direct checkout (landing page). null means use the cart. */
  directItems: CartLine[] | null;
  order: PendingOrder | null;
  offer: CommerceUpsellOffer | null;
  setStage(stage: FunnelStage): void;
  startUpsell(order: PendingOrder, offer: CommerceUpsellOffer): void;
  close(): void;
}

export const useFunnel = create<FunnelState>()((set) => ({
  stage: "idle",
  directItems: null,
  order: null,
  offer: null,
  setStage: (stage) => set({ stage }),
  startUpsell: (order, offer) => set({ stage: "upsell", order, offer }),
  close: () => set({ stage: "idle", directItems: null, order: null, offer: null }),
}));

export function openCart() {
  useFunnel.setState({ stage: "cart", directItems: null });
}

/** Open checkout for the cart (no argument) or for explicit items (landing page). */
export function openCheckout(items?: CartLine[]) {
  useFunnel.setState({ stage: "checkout", directItems: items && items.length ? items : null });
}

/** Warm the overlay chunks on pointer/focus intent. */
export function prefetchFunnel() {
  void import("@/components/storefront/funnel/checkout-modal");
  void import("@/components/storefront/funnel/cart-drawer");
}

const pendingKey = (slug: string) => `${slug}-pending-order`;

export function writePendingOrder(slug: string, order: PendingOrder) {
  try { sessionStorage.setItem(pendingKey(slug), JSON.stringify(order)); } catch { /* storage unavailable */ }
}

export function readPendingOrder(slug: string): PendingOrder | null {
  try {
    const raw = sessionStorage.getItem(pendingKey(slug));
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingOrder;
    return value && typeof value.orderId === "string" && value.totals && Array.isArray(value.lines) ? value : null;
  } catch { return null; }
}
