ALTER TABLE orders ADD COLUMN utm_source TEXT;
ALTER TABLE orders ADD COLUMN utm_medium TEXT;
ALTER TABLE orders ADD COLUMN utm_campaign TEXT;
ALTER TABLE orders ADD COLUMN utm_content TEXT;
ALTER TABLE orders ADD COLUMN utm_term TEXT;
ALTER TABLE orders ADD COLUMN referrer_host TEXT;
ALTER TABLE orders ADD COLUMN landing_path TEXT;
ALTER TABLE orders ADD COLUMN click_id_type TEXT CHECK (click_id_type IS NULL OR click_id_type IN ('fbclid','ttclid','gclid','sccid'));
CREATE INDEX IF NOT EXISTS idx_orders_utm ON orders(utm_source, utm_campaign, created_at);
