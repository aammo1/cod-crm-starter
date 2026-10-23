CREATE TABLE IF NOT EXISTS cod_remittances (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL CHECK (length(reference) BETWEEN 1 AND 120),
  received_on TEXT NOT NULL,
  declared_total INTEGER CHECK (declared_total IS NULL OR declared_total >= 0),
  fees_total INTEGER NOT NULL DEFAULT 0 CHECK (fees_total >= 0),
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cod_remittance_lines (
  remittance_id TEXT NOT NULL REFERENCES cod_remittances(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id),
  tracking_number TEXT,
  expected_amount INTEGER NOT NULL,
  paid_amount INTEGER NOT NULL CHECK (paid_amount >= 0),
  fee_amount INTEGER NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  PRIMARY KEY (remittance_id, order_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_remittance_lines_order ON cod_remittance_lines(order_id);

ALTER TABLE orders ADD COLUMN cod_paid_at TEXT;
