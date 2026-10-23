"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProductPack } from "@/lib/commerce-types";
import { track } from "@/lib/storefront/track";

export const MAX_LINE_QTY = 10;

export interface CartLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  image: string;
  /** e.g. "Noir / 38". */
  optionsLabel: string;
  /** Display only; the server recomputes every price. */
  unitPrice: number;
  /** 1..10 per variant. */
  qty: number;
  /** For client-side pack preview. */
  packs: ProductPack[];
}

export interface CartState {
  lines: CartLine[];
  add(line: Omit<CartLine, "qty">, qty?: number): void;
  setQty(variantId: string, qty: number): void;
  remove(variantId: string): void;
  clear(): void;
}

const clamp = (qty: number) => Math.min(MAX_LINE_QTY, Math.max(1, Math.floor(qty) || 1));

export function createCartStore(storeSlug: string) {
  return create<CartState>()(
    persist(
      (set, get) => ({
        lines: [],
        add(line, qty = 1) {
          const existing = get().lines.find((l) => l.variantId === line.variantId);
          const added = clamp(qty);
          set({
            lines: existing
              ? get().lines.map((l) => (l.variantId === line.variantId ? { ...l, ...line, qty: clamp(l.qty + added) } : l))
              : [...get().lines, { ...line, qty: added }],
          });
          track("AddToCart", [{ id: line.productId, quantity: added }]);
        },
        setQty(variantId, qty) {
          set({ lines: get().lines.map((l) => (l.variantId === variantId ? { ...l, qty: clamp(qty) } : l)) });
        },
        remove(variantId) {
          set({ lines: get().lines.filter((l) => l.variantId !== variantId) });
        },
        clear() {
          set({ lines: [] });
        },
      }),
      {
        name: `${storeSlug}-cart`,
        version: 1,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({ lines: state.lines }),
        // Rehydrated after mount by CartProvider so SSR and first client render match.
        skipHydration: true,
        migrate: (persisted) => {
          const lines = (persisted as { lines?: unknown } | null)?.lines;
          return { lines: Array.isArray(lines) ? lines : [] } as CartState;
        },
      },
    ),
  );
}

export type CartStore = ReturnType<typeof createCartStore>;
