-- Durable attribution for return handling (R10): who received the parcel and who
-- inspected it, instead of a console log line / a movement lookup.
ALTER TABLE returns ADD COLUMN received_by TEXT;
ALTER TABLE returns ADD COLUMN inspected_by TEXT;
