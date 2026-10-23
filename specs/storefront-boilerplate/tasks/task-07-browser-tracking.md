# Task 07: Lazy Meta and TikTok pixels plus deduplicated server relay

## Status

complete

## Wave

2

## Description

The storefront must fire browser events for Meta (`fbq`) and TikTok (`ttq`) without hurting page speed. Each event must also be sent server-side with the **same event ID**, so each platform deduplicates the browser and server copies:
- PageView, ViewContent, AddToCart, InitiateCheckout go through the relay route.
- Purchase is queued by checkout in task 08.

zehri already solved the lazy loading: `/home/tal7a/Projects/zehri/src/lib/meta-client.ts` (lines about 19–58) loads the pixel after `load`, then `requestAnimationFrame`, then idle, or on the first user interaction. Port that pattern and extend it to TikTok.

This task also captures click attribution: Meta `_fbp`/`_fbc` (from `fbclid`), and TikTok `_ttp` and `ttclid`.

## Dependencies

**Depends on:** task-02-store-config.md, task-05-tiktok-events-backend.md
**Blocks:** task-12-storefront-shell.md

**Context from dependencies:**
- Task 02 created `store.config.ts`, with `tracking: { metaPixelId?: string; tiktokPixelId?: string }`, and `src/config/index.ts`, which exports `storeConfig`. It is **server-only**: read it in a server component and pass the IDs to the client component as props.
- Task 05 created `src/lib/services/tiktok.ts`, with `tiktokEnabled()`, `tiktokContextFromAttribution(attr, ip, ua)` and `enqueueTikTok(name, context, properties, eventTime?)`, which writes to the `tiktok_events` outbox. It also created `src/lib/tiktok-shared.ts`, with `tiktokContextSchema` (`{ eventId, sourceUrl, ttp?, ttclid? }`) and the event-name mapping constant (PageView→Pageview, ViewContent, AddToCart, InitiateCheckout, Purchase→CompletePayment).
- The existing Meta relay is `src/app/api/pixel/route.ts`. It validates `metaContextSchema` plus `name` and `params`, checks `sec-fetch-site`, applies `publicRequestBudget(request, "pixel")`, uses `readLimitedJson(request, 16_384)` and `requestMetaContext(request, parsed)`, recomputes prices from the catalog (never trusting client prices), and calls `enqueueMeta`.

## Files to Create

- `src/components/storefront/tracking/pixels.tsx`: a `"use client"` component `<Pixels metaPixelId? tiktokPixelId? />` that lazy-loads both scripts and fires PageView on route changes.
- `src/lib/storefront/track.ts`: a browser-only `track(name, payload)` helper and attribution cookie helpers. It has no imports from server modules, zod or `@/config`.

## Files to Modify

- `src/app/api/pixel/route.ts`: extend it into a relay for both platforms. Keep the path `/api/pixel`, because existing tests reference it.
- `scripts/meta-workflow.test.mjs` or `scripts/security-workflow.test.mjs`: only if you need to adapt assertions for the extended body shape. Prefer a backward-compatible body: TikTok fields are optional.

## Technical Details

### Browser helper (src/lib/storefront/track.ts)

```ts
export type TrackName = "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout";
export interface TrackContent { id: string; quantity: number }   // productId, never price

declare global { interface Window { fbq?: (...a: unknown[]) => void; ttq?: { track: (...a: unknown[]) => void; page: () => void; load?: (id: string) => void } } }

export function newEventId(): string { return crypto.randomUUID(); }

/** Fires browser pixels (if loaded/queued) AND posts the same eventId to /api/pixel via sendBeacon/fetch keepalive. */
export function track(name: TrackName, contents: TrackContent[] = []): string {
  const eventId = newEventId();
  const ids = contents.map((c) => c.id);
  window.fbq?.("track", name, ids.length ? { content_ids: ids, content_type: "product" } : {}, { eventID: eventId });
  const ttName = name === "PageView" ? null : name;          // ttq.page() handles page views
  if (ttName) window.ttq?.track(ttName, { contents: contents.map((c) => ({ content_id: c.id, quantity: c.quantity })), content_type: "product" }, { event_id: eventId });
  const body = JSON.stringify({ name, eventId, sourceUrl: location.href, params: { contents }, ...readAttribution() });
  if (!navigator.sendBeacon?.("/api/pixel", new Blob([body], { type: "application/json" }))) {
    void fetch("/api/pixel", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  }
  return eventId;
}

/** Reads _fbp, _fbc, _ttp cookies and the persisted ttclid. */
export function readAttribution(): { fbp?: string; fbc?: string; ttp?: string; ttclid?: string } { … }

/** On first load: if ?fbclid= present and no _fbc, set _fbc = `fb.1.${Date.now()}.${fbclid}` (90 days, SameSite=Lax, path=/).
 *  If ?ttclid= present, store cookie `ttclid` (90 days). Call once from <Pixels/>. */
export function captureClickIds(): void { … }
```

- The body field names must match what the server route parses. Look at `metaContextSchema` in `src/lib/meta-shared.ts` for the exact existing names (`eventId`, `sourceUrl`, `fbp`, `fbc`), and keep them.
- Task 08's checkout also needs `readAttribution()` and `newEventId()`. Export both.

### Pixels component

- Props: `metaPixelId?: string`, `tiktokPixelId?: string`. If both are missing, render `null` and load nothing.
- On mount: call `captureClickIds()`. Then schedule loading the same way zehri does: after `window` load, then `requestAnimationFrame`, then `requestIdleCallback` (with a `setTimeout(…, 1500)` fallback), **or** on the first `pointerdown`/`keydown`/`scroll`, whichever comes first.
- Meta: install the standard `fbq` stub queue immediately, so calls made before load are queued. On load, inject `https://connect.facebook.net/en_US/fbevents.js`, then `fbq('init', id)`.
- TikTok: install the standard `ttq` stub queue immediately, then inject `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${id}&lib=ttq`, then `ttq.load(id)`. Use the official TikTok base-code snippet, adapted for TypeScript.
- PageView: on first mount and on every pathname change (`usePathname()` from `next/navigation`), call `track("PageView")` and `window.ttq?.page()`. Avoid `useSearchParams` in a way that forces client-side rendering bailout. If you need the query string, read `location.search` inside an effect.
- Do **not** use `next/script` with `strategy="afterInteractive"`. The manual idle scheduling is intentional (zehri measured it as better for mobile LCP).

### Server relay (/api/pixel)

Extend the existing route so that one request enqueues for **both** platforms:
1. Keep every existing check: the `sec-fetch-site` cross-site rejection, `publicRequestBudget`, the body limit, schema validation, and price recomputation from the catalog. **Do not use `listStorefront()` per request anymore.** Use the cached `getCatalog()` from `src/lib/storefront/data.ts` (created by task 03, already merged when this task runs), so the relay does not hit SQLite for catalog reads.
2. Extend the schema with optional `ttp` and `ttclid` (same regexes as `tiktokContextSchema`). The schema must remain strict.
3. If neither `metaEnabled()` nor `tiktokEnabled()` is true, return 204 immediately, as today.
4. If Meta is enabled and `requestMetaContext(request, parsed)` returns a context, call `enqueueMeta(...)`, as today.
5. If TikTok is enabled, build the context with `tiktokContextFromAttribution({ eventId, sourceUrl, ttp, ttclid }, trustedClientIp(request), userAgent)`. Apply the **same** origin and host checks that `requestMetaContext` applies: origin must equal the `sourceUrl` origin, host must match, and the path must not be under `/crm`, `/admin` or `/login`. Then call `enqueueTikTok(name, ctx, { currency: "MAD", value, contents: [{content_id, quantity, price}] , content_type: "product" })` with server-side prices.
6. Return 204 on success, 403 when no context could be built for any enabled platform, and 400 on validation errors, as the current behaviour does.
7. Make sure PageView still works for TikTok (server-side `Pageview` with no properties).

Both platforms use the same `eventId`, so browser and server events are deduplicated on each side.

## Acceptance Criteria

- [ ] With no pixel IDs configured, `<Pixels/>` renders nothing, no third-party script is requested, and `/api/pixel` returns 204.
- [ ] With both IDs set, both scripts load only after idle or first interaction. Verify with Playwright or the browser network panel that they are absent from the initial HTML and requested after load.
- [ ] One `track("AddToCart", …)` call produces one `fbq` call and one `ttq.track` call with the same event ID, plus one POST to `/api/pixel`. With both platforms enabled server-side, that POST creates one `meta_events` row and one `tiktok_events` row sharing that event ID.
- [ ] Visiting `/?fbclid=abc&ttclid=xyz` sets `_fbc` and `ttclid` cookies.
- [ ] `src/lib/storefront/track.ts` has no imports from `@/lib/services`, `@/lib/db`, `@/config` or zod.
- [ ] `npm run test:meta` and `npm run test:security` pass, along with lint and typecheck.

## Notes

Mounting `<Pixels/>` in the storefront layout is done in task 12. This task only builds the component and the route. Use mock or stubbed fetch for any verification, with no live calls.
