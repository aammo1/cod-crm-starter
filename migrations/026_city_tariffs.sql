CREATE TABLE IF NOT EXISTS city_tariffs (
  city_id INTEGER PRIMARY KEY,
  courier_cost INTEGER CHECK (courier_cost IS NULL OR courier_cost >= 0),
  customer_fee_override INTEGER CHECK (customer_fee_override IS NULL OR customer_fee_override >= 0),
  override_ignores_free_threshold INTEGER NOT NULL DEFAULT 0 CHECK (override_ignores_free_threshold IN (0,1)),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);
