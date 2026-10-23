ALTER TABLE orders ADD COLUMN delivery_outcome TEXT CHECK (delivery_outcome IS NULL OR delivery_outcome IN ('delivered','refused'));
ALTER TABLE orders ADD COLUMN delivery_outcome_at TEXT;
ALTER TABLE orders ADD COLUMN delivery_outcome_by TEXT;
ALTER TABLE orders ADD COLUMN delivery_outcome_source TEXT CHECK (delivery_outcome_source IS NULL OR delivery_outcome_source IN ('agent','tracking'));
CREATE INDEX idx_orders_delivery_outcome ON orders(delivery_outcome, delivery_outcome_at);
