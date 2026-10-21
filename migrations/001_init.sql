-- Starter-only fresh lineage; not a migration path for a live source database.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL,
  items_json TEXT NOT NULL, upsell_offer_json TEXT, upsell_status TEXT NOT NULL DEFAULT 'pending',
  upsell_items_json TEXT, subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL,
  total INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'MAD',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NOT NULL, payload_json TEXT NOT NULL, last_error TEXT, delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','agent')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL,
  price INTEGER NOT NULL, description TEXT NOT NULL DEFAULT '', story TEXT NOT NULL DEFAULT '',
  materials_json TEXT NOT NULL DEFAULT '[]', badge TEXT, is_best_seller INTEGER NOT NULL DEFAULT 0,
  upsell_ref TEXT, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_colors (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL, hex TEXT NOT NULL DEFAULT '#000000', position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id, name)
);
CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- Nullable legacy bridge until catalog/operational callers use generic options.
  color_id TEXT REFERENCES product_colors(id) ON DELETE CASCADE,
  size TEXT, sku TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(product_id, color_id, size)
);
CREATE TABLE IF NOT EXISTS stock_balances (
  variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  location TEXT NOT NULL DEFAULT 'MAIN',
  physical INTEGER NOT NULL DEFAULT 0, reserved INTEGER NOT NULL DEFAULT 0, quarantine INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(variant_id, location),
  CHECK(physical >= 0 AND reserved >= 0 AND quarantine >= 0 AND quarantine <= physical)
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY, variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  location TEXT NOT NULL DEFAULT 'MAIN',
  kind TEXT NOT NULL CHECK(kind IN ('opening','reserve','release','dispatch','receive_sellable','receive_quarantine','adjust_physical','adjust_quarantine')),
  qty INTEGER NOT NULL, reason TEXT, order_id TEXT, submission_id TEXT,
  actor TEXT NOT NULL, source TEXT NOT NULL, ref TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL, variant_id TEXT NOT NULL REFERENCES variants(id),
  qty INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','consumed','released')),
  created_at TEXT NOT NULL, resolved_at TEXT,
  UNIQUE(order_id, variant_id)
);
CREATE TABLE IF NOT EXISTS order_contacts (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
  agent_id TEXT, channel TEXT NOT NULL CHECK(channel IN ('whatsapp','phone','note')),
  outcome TEXT NOT NULL CHECK(outcome IN ('no_answer','call_back_later','note','confirmed_info')),
  note TEXT, next_callback_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS courier_submissions (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','submitting','submitted','failed','needs_review')),
  attempts INTEGER NOT NULL DEFAULT 0, next_retry_at TEXT NOT NULL, payload_json TEXT,
  tracking_number TEXT, raw_response_json TEXT, last_error TEXT,
  normalized_status TEXT, raw_status TEXT, last_sync_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_submissions_active ON courier_submissions(order_id) WHERE status IN ('queued','submitting');
CREATE TABLE IF NOT EXISTS delivery_notes (
  id TEXT PRIMARY KEY, ref TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','saved','failed')),
  created_by TEXT, created_at TEXT NOT NULL, saved_at TEXT
);
CREATE TABLE IF NOT EXISTS delivery_note_parcels (
  delivery_note_id TEXT NOT NULL REFERENCES delivery_notes(id),
  submission_id TEXT NOT NULL REFERENCES courier_submissions(id),
  added_at TEXT NOT NULL, PRIMARY KEY(delivery_note_id, submission_id)
);
CREATE TABLE IF NOT EXISTS tracking_events (
  id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES courier_submissions(id),
  raw_status TEXT NOT NULL, normalized_status TEXT NOT NULL, observed_at TEXT,
  raw_json TEXT, created_at TEXT NOT NULL,
  UNIQUE(submission_id, raw_status, observed_at)
);
CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY, submission_id TEXT NOT NULL UNIQUE REFERENCES courier_submissions(id),
  status TEXT NOT NULL DEFAULT 'returning' CHECK(status IN ('returning','received','inspected')),
  sellable_qty INTEGER NOT NULL DEFAULT 0, damaged_qty INTEGER NOT NULL DEFAULT 0,
  reason TEXT, received_at TEXT, inspected_at TEXT, created_at TEXT NOT NULL
);

-- CRM fields on orders
ALTER TABLE orders ADD COLUMN confirmation_status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE orders ADD COLUMN address TEXT;
ALTER TABLE orders ADD COLUMN city_id INTEGER;
ALTER TABLE orders ADD COLUMN city_name TEXT;
ALTER TABLE orders ADD COLUMN cod_status TEXT NOT NULL DEFAULT 'awaiting_payment';
ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT 'storefront';
ALTER TABLE orders ADD COLUMN assigned_to TEXT REFERENCES users(id);

CREATE INDEX idx_orders_confirmation ON orders(confirmation_status);
CREATE INDEX idx_submissions_order ON courier_submissions(order_id);
CREATE INDEX idx_reservations_order ON reservations(order_id);
CREATE INDEX idx_movements_variant ON stock_movements(variant_id, created_at);
CREATE INDEX idx_contacts_order ON order_contacts(order_id, created_at);
