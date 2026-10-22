-- Hot lookups that previously scanned: tracking-number returns/resolution,
-- BL readiness per submission and the pending-upsell expiry sweep.
-- Non-unique on purpose: existing copies may already hold duplicate tracking
-- numbers, and a failing boot migration is worse than a scan.
CREATE INDEX IF NOT EXISTS idx_submissions_tracking ON courier_submissions(tracking_number) WHERE tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_note_parcels_submission ON delivery_note_parcels(submission_id);
CREATE INDEX IF NOT EXISTS idx_orders_upsell_expiry ON orders(upsell_status, upsell_expires_at);
-- Must match normalizedPhoneExpr() in src/lib/services/orders.ts exactly
-- (duplicate-phone flags and customer history).
CREATE INDEX IF NOT EXISTS idx_orders_phone_normalized ON orders(replace(replace(replace(replace(customer_phone, ' ', ''), '-', ''), '(', ''), ')', ''));
