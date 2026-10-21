-- Per-variant inspection results for a return (R4). `returns.sellable_qty` /
-- `damaged_qty` stay as the totals; these rows are the authoritative split.
CREATE TABLE IF NOT EXISTS return_lines (
  return_id TEXT NOT NULL REFERENCES returns(id),
  variant_id TEXT NOT NULL REFERENCES variants(id),
  dispatched_qty INTEGER NOT NULL CHECK(dispatched_qty >= 0),
  sellable_qty INTEGER NOT NULL DEFAULT 0 CHECK(sellable_qty >= 0),
  damaged_qty INTEGER NOT NULL DEFAULT 0 CHECK(damaged_qty >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (return_id, variant_id),
  CHECK(sellable_qty + damaged_qty <= dispatched_qty)
);
