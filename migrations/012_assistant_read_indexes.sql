-- Bounded on-demand investigations: avoid full-history sorts and scans.
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_status ON orders(assigned_to, confirmation_status);
CREATE INDEX IF NOT EXISTS idx_tracking_submission_created ON tracking_events(submission_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_order_created ON courier_submissions(order_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_status_created ON courier_submissions(status, created_at, id);
CREATE INDEX IF NOT EXISTS idx_movements_order_created ON stock_movements(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_variant ON reservations(variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_status_created ON returns(status, created_at DESC);
