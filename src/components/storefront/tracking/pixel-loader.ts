// Pixel stubs and the idle script scheduler. Loaded on demand by ./pixels.tsx so the first-load
// bundle only carries it when a pixel id is configured (and after hydration).
type Fbq = {
  (...args: unknown[]): void;
  queue: unknown[][];
  callMethod?: (...args: unknown[]) => void;
  push?: Fbq;
  loaded: boolean;
  version: string;
};
type TtqStub = unknown[] & Record<string, unknown>;
type PixelWindow = Omit<Window, "fbq" | "ttq"> & { fbq?: unknown; _fbq?: unknown; ttq?: unknown; TiktokAnalyticsObject?: string };

const TTQ_METHODS = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];

export function installMeta(id: string) {
  const w = window as unknown as PixelWindow;
  if (w.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  w.fbq = w._fbq = fbq;
  fbq("init", id); // queued; replayed once fbevents.js loads
}

export function installTikTok(id: string) {
  const w = window as unknown as PixelWindow;
  if (w.ttq) return;
  w.TiktokAnalyticsObject = "ttq";
  const ttq = [] as unknown as TtqStub & { _i: Record<string, unknown[]>; _o: Record<string, unknown>; _t: Record<string, number> };
  ttq._i = {};
  ttq._o = {};
  ttq._t = {};
  for (const method of TTQ_METHODS) {
    ttq[method] = (...args: unknown[]) => { ttq.push([method, ...args]); };
  }
  ttq.load = (sdkId: string, options?: unknown) => {
    ttq._i[sdkId] = [];
    ttq._t[sdkId] = Date.now();
    ttq._o[sdkId] = options ?? {};
  };
  w.ttq = ttq;
  (ttq.load as (id: string) => void)(id);
}

export function inject(src: string) {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

/** Starts loading after window load + 2 frames + idle, or on first interaction. */
export function scheduleLoad(start: () => void) {
  let started = false;
  let frame = 0;
  let idle: number | undefined;
  let timer: number | undefined;
  const events = ["pointerdown", "keydown", "scroll", "pagehide"] as const;

  const run = () => {
    if (started) return;
    started = true;
    window.removeEventListener("load", afterLoad);
    for (const name of events) window.removeEventListener(name, run);
    window.cancelAnimationFrame(frame);
    if (idle !== undefined && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
    if (timer !== undefined) window.clearTimeout(timer);
    start();
  };
  function afterLoad() {
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(run, { timeout: 1500 });
        else timer = window.setTimeout(run, 1500);
      });
    });
  }

  window.addEventListener("pointerdown", run, { once: true, passive: true });
  window.addEventListener("keydown", run, { once: true });
  window.addEventListener("scroll", run, { once: true, passive: true });
  window.addEventListener("pagehide", run, { once: true });
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
  return () => {
    started = true;
    window.removeEventListener("load", afterLoad);
    for (const name of events) window.removeEventListener(name, run);
    window.cancelAnimationFrame(frame);
    if (idle !== undefined && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
