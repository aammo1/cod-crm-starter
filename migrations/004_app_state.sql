-- Tiny key/value store for worker runtime state (task-14) — currently holds
-- `tracking_last_sync` (last successful tracking poll) consumed by
-- getTrackingHealth() and the CRM dashboard (task-17).
CREATE TABLE IF NOT EXISTS app_state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
