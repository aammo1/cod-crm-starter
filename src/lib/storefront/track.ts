// Browser-only tracking helpers. Keep this module free of server, zod and config imports.

export type TrackName = "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout";
export interface TrackContent { id: string; quantity: number } // product id, never a price

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: { track: (...args: unknown[]) => void; page: () => void; load?: (id: string) => void };
  }
}

const NINETY_DAYS = 90 * 24 * 60 * 60;

export function newEventId(): string {
  return crypto.randomUUID();
}

function cookie(name: string): string | undefined {
  const part = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : undefined;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${NINETY_DAYS}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

/** Reads _fbp, _fbc, _ttp cookies and the persisted ttclid. */
export function readAttribution(): { fbp?: string; fbc?: string; ttp?: string; ttclid?: string } {
  if (typeof document === "undefined") return {};
  const fbp = cookie("_fbp");
  const fbc = cookie("_fbc");
  const ttp = cookie("_ttp");
  const ttclid = cookie("ttclid");
  return {
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {}),
    ...(ttp ? { ttp } : {}),
    ...(ttclid ? { ttclid } : {}),
  };
}

/** Persists click ids from the landing URL (_fbc from fbclid, ttclid). Call once on first load. */
export function captureClickIds(): void {
  try {
    const params = new URLSearchParams(location.search);
    const fbclid = params.get("fbclid");
    if (fbclid && /^[\w-]{1,400}$/.test(fbclid) && !cookie("_fbc")?.endsWith(`.${fbclid}`)) {
      setCookie("_fbc", `fb.1.${Date.now()}.${fbclid}`);
    }
    const ttclid = params.get("ttclid");
    if (ttclid && /^[\w.-]{1,512}$/.test(ttclid)) setCookie("ttclid", ttclid);
  } catch { /* Tracking must never interrupt shopping. */ }
}

/** Fires browser pixels (if loaded or queued) and posts the same eventId to /api/pixel. */
export function track(name: TrackName, contents: TrackContent[] = []): string {
  const eventId = newEventId();
  try {
    const ids = contents.map((item) => item.id);
    window.fbq?.("track", name, ids.length ? { content_ids: ids, content_type: "product" } : {}, { eventID: eventId });
    // ttq.page() handles page views in the browser.
    if (name !== "PageView") {
      window.ttq?.track(name, {
        contents: contents.map((item) => ({ content_id: item.id, quantity: item.quantity })),
        content_type: "product",
      }, { event_id: eventId });
    }
    // Strip the query string so customer data never travels in URLs.
    const body = JSON.stringify({
      name, eventId, sourceUrl: location.origin + location.pathname,
      params: contents.length ? { contents } : {}, ...readAttribution(),
    });
    const sent = navigator.sendBeacon?.("/api/pixel", new Blob([body], { type: "application/json" }));
    if (!sent) {
      void fetch("/api/pixel", {
        method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true,
      }).catch(() => {});
    }
  } catch { /* Tracking must never interrupt shopping. */ }
  return eventId;
}
