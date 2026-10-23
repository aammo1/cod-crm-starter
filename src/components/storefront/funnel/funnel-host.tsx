"use client";

import dynamic from "next/dynamic";
import { useFunnel } from "@/stores/funnel";
import type { FunnelProps } from "./funnel-props";

const CartDrawer = dynamic(() => import("./cart-drawer"), { ssr: false });
const CheckoutModal = dynamic(() => import("./checkout-modal"), { ssr: false });
const UpsellModal = dynamic(() => import("./upsell-modal"), { ssr: false });

export function FunnelHost(props: FunnelProps) {
  const stage = useFunnel((s) => s.stage);
  if (stage === "idle") return null;
  return (
    <>
      {stage === "cart" && <CartDrawer {...props} />}
      {stage === "checkout" && <CheckoutModal {...props} />}
      {stage === "upsell" && <UpsellModal {...props} />}
    </>
  );
}
