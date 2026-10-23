CREATE TABLE IF NOT EXISTS checkout_leads (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  items_json TEXT NOT NULL CHECK (json_valid(items_json)),
  source_path TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','contacted','converted','dismissed')),
  converted_order_id TEXT REFERENCES orders(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON checkout_leads(phone, status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON checkout_leads(status, created_at);
