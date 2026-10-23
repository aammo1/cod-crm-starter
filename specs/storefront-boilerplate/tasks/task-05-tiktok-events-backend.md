# Task 05: TikTok Events API outbox and worker

## Status

complete

## Wave

1

## Description

The owner advertises on Meta and TikTok. The CRM already has a durable Meta Conversions API (CAPI) pipeline:
- `meta_purchases` holds the Purchase context per order.
- A trigger `meta_purchase_resolved` freezes a snapshot when the upsell resolves.
- `meta_events` is an outbox with attempts, leases and backoff.
- A worker in `src/lib/workers/meta.ts` sends the events.

This task builds the **same pipeline for TikTok** (Events API v1.3). Purchases then reach TikTok reliably, deduplicated by `event_id` with the browser pixel that task 07 adds. Mirror the Meta implementation closely: the same patterns, retry policy and redaction. Like Meta, it stays fully disabled when it is not configured.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-07-browser-tracking.md, task-08-storefront-checkout-api.md

**Context from dependencies:** None. Read the existing Meta code first: `migrations/010_meta_events.sql`, `src/lib/services/meta.ts`, `src/lib/meta-shared.ts`, `src/lib/workers/meta.ts`, `scripts/meta-workflow.test.mjs`, and where `meta_purchases` is inserted (`grep -rn meta_purchases src`, which hits `storefront-orders.ts` and `order-lifecycle.ts`).

## Files to Create

- `migrations/019_tiktok_events.sql`
- `src/lib/tiktok-shared.ts`: browser-safe types and zod context schema. Mirror `meta-shared.ts`.
- `src/lib/services/tiktok.ts`: `tiktokEnabled`, `tiktokContextFromAttribution`, `recordTikTokPurchaseContext`, `enqueueTikTok`, `finalizeTikTokPurchases`, `tiktokTick`.
- `src/lib/workers/tiktok.ts`: `startTikTokWorker()`. Mirror `startMetaWorker`.

## Files to Modify

- `src/lib/workers/index.ts`: start the TikTok worker with `startSafely("tiktok", startTikTokWorker)` and report it in `workerHealth()`.
- `src/lib/services/order-lifecycle.ts`: wherever Meta purchase rows are cleaned up or handled for archived or test orders, do the same for `tiktok_purchases`.
- `.env.example`: add the TikTok variables listed below, with comments.

Do **not** modify `storefront-orders.ts` or `storefront-api-schemas.ts`. Task 08 wires TikTok attribution into checkout using the functions you export.

## Technical Details

### Migration 019_tiktok_events.sql

```sql
CREATE TABLE tiktok_purchases (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  event_id TEXT NOT NULL UNIQUE,
  context_json TEXT NOT NULL,
  deadline INTEGER NOT NULL,
  snapshot_json TEXT,
  queued INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE tiktok_events (
  event_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  lease TEXT,
  sent_at INTEGER,
  failed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX tiktok_events_due ON tiktok_events(failed, sent_at, available_at);
CREATE TRIGGER tiktok_purchase_resolved AFTER UPDATE OF upsell_status ON orders
WHEN NEW.upsell_status <> 'pending'
BEGIN
  UPDATE tiktok_purchases SET snapshot_json = json_object(
    'total', NEW.total, 'items', json(NEW.items_json),
    'upsellItems', json(COALESCE(NEW.upsell_items_json, '[]')),
    'customerPhone', NEW.customer_phone, 'eventTime', unixepoch()
  ) WHERE order_id = NEW.id AND snapshot_json IS NULL; END;
```

Keep the trigger's `END;` on the same line as the last statement. The migration runner splits on line-ending semicolons; see the comment in migration 010.

### Environment Variables

- `TIKTOK_PIXEL_ID`: pixel code (for example `CXXXXXXXXXXXXXXXXXXX`). The browser uses `store.config.ts` `tracking.tiktokPixelId`; the server uses this env value.
- `TIKTOK_ACCESS_TOKEN`: Events API access token (secret).
- `TIKTOK_TEST_EVENT_CODE`: optional, sent as `test_event_code`.
- `TIKTOK_API_BASE`: default `https://business-api.tiktok.com/open_api/v1.3`.

`tiktokEnabled()` returns true only if both `TIKTOK_PIXEL_ID` (matching `/^[A-Z0-9]{10,30}$/`) and `TIKTOK_ACCESS_TOKEN` are set.

### Context (tiktok-shared.ts)

```ts
export const tiktokContextSchema = z.object({
  eventId: z.string().uuid(),
  sourceUrl: z.string().url().max(2048),
  ttp: z.string().max(256).regex(/^[\w.-]+$/).optional(),        // _ttp cookie
  ttclid: z.string().max(512).regex(/^[\w.-]+$/).optional(),     // click id from ?ttclid= (persisted by task 07)
}).strict();
```

The server-built context (`tiktokContextFromAttribution(attr, ip, ua)`) holds `{ eventId, sourceUrl (origin+path only), user: { ttp?, ttclid?, ip?, user_agent } }`.

### Event payload (Events API v1.3)

`POST {TIKTOK_API_BASE}/event/track/`, headers `Access-Token: <token>` and `Content-Type: application/json`:

```json
{
  "event_source": "web",
  "event_source_id": "<TIKTOK_PIXEL_ID>",
  "test_event_code": "<optional>",
  "data": [{
    "event": "CompletePayment",
    "event_time": 1730000000,
    "event_id": "<uuid shared with browser ttq.track>",
    "user": {
      "ttclid": "...", "ttp": "...",
      "phone": "<sha256 of E.164 phone, e.g. +212612345678, lowercase hex>",
      "external_id": "<sha256 of normalized phone>",
      "ip": "...", "user_agent": "..."
    },
    "page": { "url": "https://store.ma/produit/x" },
    "properties": {
      "currency": "MAD", "value": 349, "content_type": "product",
      "contents": [{ "content_id": "<productId>", "content_name": "...", "quantity": 2, "price": 199 }]
    }
  }]
}
```

- Purchase maps to `CompletePayment`. Upper-funnel event names map as follows: `PageView` → `Pageview`, `ViewContent` → `ViewContent`, `AddToCart` → `AddToCart`, `InitiateCheckout` → `InitiateCheckout`. Put this mapping in one exported constant, so it is easy to change if TikTok renames events. Add a code comment telling the implementer to verify names against TikTok's current docs when online.
- Phone hashing: normalize with `normalizeMaPhone` from `@/lib/phone` to the national format, convert to E.164 `+212XXXXXXXXX`, then SHA-256 hex. Never store or log the raw phone in `tiktok_events.payload_json`; store only hashes.
- A response is a success only if HTTP 200 **and** the JSON field `code === 0`. Any other result is a failure. Retry with the same backoff and attempt limits as `metaTick`. Copy its constants; do not invent new ones.
- Redact the access token from any logged error. It travels in a header, but scrub it anyway with the same approach as Meta.

### Functions (services/tiktok.ts)

Mirror these Meta functions one for one:
- `recordTikTokPurchaseContext(db, orderId, context, deadline)`: `INSERT OR IGNORE` into `tiktok_purchases`. Task 08 calls it inside the checkout transaction, next to the existing Meta insert. Use the same `deadline` semantics as Meta.
- `finalizeTikTokPurchases()`: like `finalizeMetaPurchases`. For rows with a `snapshot_json` that are not yet queued, or whose deadline has passed, build the CompletePayment payload, insert it into `tiktok_events`, and set `queued = 1`.
- `enqueueTikTok(name, context, properties, eventTime?)`: `INSERT OR IGNORE` an upper-funnel event, used by task 07's relay.
- `tiktokTick()`: finalize, then lease due events and send them (one event per request is fine).

### Worker

`startTikTokWorker()`:
- Returns immediately when `!tiktokEnabled()`.
- Otherwise uses `setInterval(tiktokTick, <same interval as Meta>)`.
- Stores the timer on `globalThis.__crmTikTokWorker`.

## Acceptance Criteria

- [ ] A fresh DB migrates through 019.
- [ ] With TikTok env unset, the worker is not started, `workerHealth().tiktok.enabled === false`, and no rows are written anywhere.
- [ ] Exercise the service in-process: insert an order plus a `tiktok_purchases` row, set `upsell_status` to `declined`, and run `tiktokTick()` with `fetch` stubbed. One `CompletePayment` must be sent with `value = orders.total`, the hashed phone, and the same `event_id`.
- [ ] A non-zero `code` in the response leaves the event unsent, with `attempts` incremented.
- [ ] `npm test` passes, including `test:meta` unchanged. `npm run lint` and `npx tsc --noEmit` pass.

## Notes

All verification must run with the external network blocked (`NODE_OPTIONS=--import=$(pwd)/scripts/block-external-network.mjs`). Stub `fetch`; never call TikTok live.
