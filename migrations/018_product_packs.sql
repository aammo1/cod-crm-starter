CREATE TABLE product_packs (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 2 AND 10),
  price_mad INTEGER NOT NULL CHECK(price_mad > 0),
  label TEXT CHECK(label IS NULL OR length(trim(label)) BETWEEN 1 AND 60),
  highlight INTEGER NOT NULL DEFAULT 0 CHECK(highlight IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_product_packs_active_qty ON product_packs(product_id, quantity) WHERE active = 1;
CREATE INDEX idx_product_packs_product ON product_packs(product_id);
ALTER TABLE products ADD COLUMN landing_enabled INTEGER NOT NULL DEFAULT 0 CHECK(landing_enabled IN (0,1));
ALTER TABLE orders ADD COLUMN pack_snapshot_json TEXT CHECK(pack_snapshot_json IS NULL OR (json_valid(pack_snapshot_json) AND json_type(pack_snapshot_json) = 'array'));
