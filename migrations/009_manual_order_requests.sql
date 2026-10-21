CREATE TABLE IF NOT EXISTS manual_order_requests (
  request_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  agent_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_manual_order_requests_order ON manual_order_requests(order_id);
