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

const FIRST_TOUCH = "first-touch";
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

/** Stored first-touch fields (30-day expiry) in the checkout wire format. */
export function readFirstTouch(): Record<string, string> {
  try {
    const { at, ...rest } = JSON.parse(localStorage.getItem(FIRST_TOUCH) ?? "{}");
    if (Date.now() - at < 30 * 864e5) return rest;
  } catch { /* storage unavailable */ }
  return {};
}

/** Stores utm_*, click id type, external referrer host and landing path; a new campaign click replaces it. */
export function captureFirstTouch(): void {
  try {
    const params = new URLSearchParams(location.search);
    const touch: Record<string, string | number> = {};
    for (const key of UTM) {
      const value = params.get(key)?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
      if (value) touch[key] = value;
    }
    const click = ["fbclid", "ttclid", "gclid", "ScCid"].find((key) => params.has(key));
    if (click) touch.clickIdType = click.toLowerCase();
    if (Object.keys(touch).length || !Object.keys(readFirstTouch()).length) {
      const host = new URL(document.referrer || "x:").hostname;
      if (host && host !== location.hostname) touch.referrerHost = host;
      touch.landingPath = location.pathname;
      touch.at = Date.now();
      localStorage.setItem(FIRST_TOUCH, JSON.stringify(touch));
    }
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
