"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createCartStore, type CartState, type CartStore } from "./cart";

interface CartContextValue { store: CartStore; hydrated: boolean }

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ storeSlug, children }: { storeSlug: string; children: ReactNode }) {
  const [store] = useState(() => createCartStore(storeSlug));
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.resolve(store.persist.rehydrate()).finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, [store]);
  return <CartContext.Provider value={{ store, hydrated }}>{children}</CartContext.Provider>;
}

function useCartContext(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("CartProvider manquant.");
  return ctx;
}

export function useCart<T>(selector: (state: CartState) => T): T {
  return useStore(useCartContext().store, selector);
}

/** Imperative access for event handlers (no subscription). */
export function useCartApi(): CartStore {
  return useCartContext().store;
}

/** False until localStorage has been read; render counts only when true. */
export function useCartHydrated(): boolean {
  return useCartContext().hydrated;
}
