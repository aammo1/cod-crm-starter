"use client";

import { lazy, Suspense, useRef } from "react";
import { useFunnel } from "@/stores/funnel";
import type { FunnelProps } from "./funnel-props";

// Toasts are only used by overlays; keep sonner out of the first-load bundle.
const OverlayToaster = lazy(() => import("./overlay-toaster"));
const CartDrawer = lazy(() => import("./cart-drawer"));
const CheckoutModal = lazy(() => import("./checkout-modal"));
const UpsellModal = lazy(() => import("./upsell-modal"));

export function FunnelHost(props: FunnelProps) {
  const stage = useFunnel((s) => s.stage);
  const opened = useRef(false);
  if (stage !== "idle") opened.current = true;
  if (!opened.current) return null;
  return (
    <Suspense fallback={null}>
      <OverlayToaster />
      {stage === "cart" && <CartDrawer {...props} />}
      {stage === "checkout" && <CheckoutModal {...props} />}
      {stage === "upsell" && <UpsellModal {...props} />}
    </Suspense>
  );
}
