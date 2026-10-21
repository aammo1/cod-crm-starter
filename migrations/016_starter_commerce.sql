-- Fresh starter lineage: 001 makes legacy color/size nullable. Generic writers
-- MUST supply options_key, including '[]' for the single optionless variant.
-- NULL keys exist only for transitional legacy writers; remove that bridge in task 20.
ALTER TABLE products ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(images_json) AND json_type(images_json) = 'array');
ALTER TABLE products ADD COLUMN option_definitions_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(option_definitions_json) AND json_type(option_definitions_json) = 'array' AND json_array_length(option_definitions_json) <= 3);
ALTER TABLE variants ADD COLUMN options_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(options_json) AND json_type(options_json) = 'array' AND json_array_length(options_json) <= 3);
ALTER TABLE variants ADD COLUMN options_key TEXT CHECK(options_key IS NULL OR (json_valid(options_key) AND json_type(options_key) = 'array'));
ALTER TABLE variants ADD COLUMN label TEXT NOT NULL DEFAULT 'Standard' CHECK(length(trim(label)) > 0);
ALTER TABLE variants ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(images_json) AND json_type(images_json) = 'array');
-- Includes archived variants: an edit must reuse their stable IDs/SKUs.
CREATE UNIQUE INDEX idx_variants_product_options ON variants(product_id, options_key) WHERE options_key IS NOT NULL;

-- Offer content (allowed variant/options/price snapshots) stays in upsell_offer_json.
ALTER TABLE orders ADD COLUMN upsell_offer_id TEXT;
ALTER TABLE orders ADD COLUMN upsell_expires_at TEXT;
-- Random per-order nonce, NOT the bearer token. Derive a domain-separated HMAC
-- over order ID + nonce using AUTH_SECRET; persist only its verifier hash here.
-- AUTH_SECRET rotation invalidates tokens AND changes reconstructed replay tokens;
-- keep the original secret available until outstanding offers/replays are retired.
ALTER TABLE orders ADD COLUMN order_token_nonce TEXT;
ALTER TABLE orders ADD COLUMN order_token_verifier TEXT;
CREATE UNIQUE INDEX idx_orders_upsell_offer_id ON orders(upsell_offer_id) WHERE upsell_offer_id IS NOT NULL;

-- scope = 'checkout' or 'upsell:<orderId>'; never expire/delete to reuse a key.
-- Write inside the SAME immediate transaction as order/offer/durable jobs.
-- response_json is the immutable response WITHOUT orderToken: reconstruct that
-- field from orders.order_token_nonce + AUTH_SECRET. Never persist plaintext tokens.
CREATE TABLE storefront_request_receipts (
  scope TEXT NOT NULL CHECK(scope = 'checkout' OR (substr(scope, 1, 7) = 'upsell:' AND length(scope) > 7)),
  request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 128),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  order_id TEXT NOT NULL REFERENCES orders(id),
  response_json TEXT NOT NULL CHECK(json_valid(response_json) AND json_type(response_json) = 'object' AND json_type(response_json, '$.orderToken') IS NULL),
  created_at TEXT NOT NULL,
  PRIMARY KEY(scope, request_key),
  CHECK(scope = 'checkout' OR scope = 'upsell:' || order_id)
);
CREATE INDEX idx_storefront_receipts_order ON storefront_request_receipts(order_id);
