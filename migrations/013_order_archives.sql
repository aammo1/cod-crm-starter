ALTER TABLE orders ADD COLUMN archived_at TEXT;
ALTER TABLE orders ADD COLUMN archived_by TEXT;
CREATE INDEX idx_orders_archive_created ON orders(archived_at, created_at);
