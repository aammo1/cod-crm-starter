"use client";

import { useCart, useCartHydrated } from "@/stores/cart-provider";
import { openCart, prefetchFunnel } from "@/stores/funnel";

export function CartButton({ label }: { label: string }) {
  const count = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const hydrated = useCartHydrated();
  return (
    <button
      type="button"
      onClick={() => openCart()}
      onPointerEnter={prefetchFunnel}
      onFocus={prefetchFunnel}
      aria-label={label}
      className="relative inline-flex size-10 items-center justify-center rounded-store hover:bg-store-muted"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
      </svg>
      {hydrated && count > 0 && (
        <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-store-accent px-1 text-xs font-semibold leading-5 text-store-accent-fg">
          {count}
        </span>
      )}
    </button>
  );
}
