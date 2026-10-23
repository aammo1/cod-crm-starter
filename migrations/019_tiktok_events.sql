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
-- Freeze the conversion before any later CRM edits can alter its contents.
-- The migration runner splits at line-ending semicolons: keep the internal
-- statement terminator and END on one line so the trigger is executed whole.
CREATE TRIGGER tiktok_purchase_resolved AFTER UPDATE OF upsell_status ON orders
WHEN NEW.upsell_status <> 'pending'
BEGIN
  UPDATE tiktok_purchases SET snapshot_json = json_object(
    'total', NEW.total, 'items', json(NEW.items_json),
    'upsellItems', json(COALESCE(NEW.upsell_items_json, '[]')),
    'customerPhone', NEW.customer_phone, 'eventTime', unixepoch()
  ) WHERE order_id = NEW.id AND snapshot_json IS NULL; END;
