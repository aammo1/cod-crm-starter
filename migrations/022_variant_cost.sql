-- Admin-only cost of goods (integer MAD) per variant. Never exposed publicly.
ALTER TABLE variants ADD COLUMN cost_price INTEGER CHECK (cost_price IS NULL OR cost_price >= 0);
