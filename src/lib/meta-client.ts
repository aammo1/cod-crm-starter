"use client";

import type { MetaContext, MetaParams, MetaPurchase } from "@/lib/meta-shared";

type Pixel = {
  (...args: unknown[]): void;
  queue: unknown[][];
  callMethod?: (...args: unknown[]) => void;
  push?: Pixel;
  loaded: boolean;
  version: string;
};
declare global {
  interface Window { fbq?: Pixel; _fbq?: Pixel }
}

const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;

function schedulePixelScript() {
  let started = false;
  let frame = 0;
  let idle: number | undefined;

  const load = () => {
    if (started) return;
    started = true;
    window.removeEventListener("load", afterLoad);
    window.removeEventListener("pointerdown", load);
    window.removeEventListener("keydown", load);
    window.removeEventListener("pagehide", load);
    window.cancelAnimationFrame(frame);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  };

  const afterLoad = () => {
    // Let eager images paint before the vendor competes for the main thread.
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        if ("requestIdleCallback" in window) {
          idle = window.requestIdleCallback(load, { timeout: 1000 });
        } else {
          load();
        }
      });
    });
  };

  // A shopper who interacts early should not wait for slow assets. CAPI events
  // are sent immediately in either case; fbq preserves their matching IDs.
  window.addEventListener("pointerdown", load, { once: true, passive: true });
  window.addEventListener("keydown", load, { once: true });
  window.addEventListener("pagehide", load, { once: true });
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
}

export function initPixel(): boolean {
  if (typeof window === "undefined" || !pixelId || !/^\d+$/.test(pixelId)) return false;
  if (window.fbq) return true;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Pixel;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  window.fbq = window._fbq = fbq;
  fbq("init", pixelId);
  schedulePixelScript();
  return true;
}

export function metaContext(): MetaContext | undefined {
  if (!initPixel()) return;
  const cookie = (name: string) => document.cookie.split("; ").find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  const click = new URLSearchParams(location.search).get("fbclid");
  if (click && /^[\w-]{1,400}$/.test(click)) {
    const current = cookie("_fbc");
    if (!current?.endsWith(`.${click}`)) {
      document.cookie = `_fbc=fb.1.${Date.now()}.${click}; Path=/; Max-Age=7776000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    }
  }
  // Strip query parameters to avoid transmitting checkout/customer data in URLs.
  return {
    eventId: crypto.randomUUID(), sourceUrl: location.origin + location.pathname,
    ...(cookie("_fbp") ? { fbp: cookie("_fbp") } : {}),
    ...(cookie("_fbc") ? { fbc: cookie("_fbc") } : {}),
  };
}

export function trackMeta(name: "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout", params: MetaParams = {}) {
  try {
    const context = metaContext();
    if (!context) return;
    window.fbq?.("track", name, params, { eventID: context.eventId });
    void fetch("/api/pixel", {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ name, params, ...context }),
    }).catch(() => {});
  } catch { /* Tracking must never interrupt shopping. */ }
}

export function trackMetaPurchase(purchase?: MetaPurchase | null) {
  try {
    if (!purchase || !initPixel()) return;
    const key = `crm-purchase:${purchase.eventId}`;
    if (sessionStorage.getItem(key)) return;
    window.fbq?.("track", "Purchase", purchase.params, { eventID: purchase.eventId });
    sessionStorage.setItem(key, "1");
  } catch { /* Server delivery is durable even when browser storage is blocked. */ }
}
