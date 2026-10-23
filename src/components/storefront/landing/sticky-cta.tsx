"use client";

import { useEffect, useState } from "react";

const LANDING_TOTAL_EVENT = "storefront:landing-total"; // dispatched by InlineOrderForm

/** Mobile bottom bar shown once the order form scrolls out of view. */
export function StickyCta({ label, currency, initialPrice }: { label: string; currency: string; initialPrice: number }) {
  const [visible, setVisible] = useState(false);
  const [price, setPrice] = useState(initialPrice);

  useEffect(() => {
    const form = document.getElementById("commander");
    if (!form) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting));
    observer.observe(form);
    const onTotal = (e: Event) => setPrice((e as CustomEvent<number>).detail);
    window.addEventListener(LANDING_TOTAL_EVENT, onTotal);
    return () => { observer.disconnect(); window.removeEventListener(LANDING_TOTAL_EVENT, onTotal); };
  }, []);

  return (
    <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-store-border bg-store-bg p-3 lg:hidden ${visible ? "" : "hidden"}`}>
      <button type="button"
        onClick={() => document.getElementById("commander")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="h-12 w-full rounded-store bg-store-accent font-bold text-white">
        {label} · {price} {currency}
      </button>
    </div>
  );
}
