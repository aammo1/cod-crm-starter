-- Phone blocklist: orders from blocked phones are still accepted, only flagged for agents.
CREATE TABLE IF NOT EXISTS blocked_phones (
  phone TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
