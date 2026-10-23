CREATE TABLE IF NOT EXISTS ad_spend (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  channel TEXT NOT NULL CHECK (channel IN ('meta','tiktok','snap','google','other')),
  campaign TEXT NOT NULL DEFAULT '' CHECK (length(campaign) <= 200),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (day, channel, campaign)
);
CREATE INDEX IF NOT EXISTS idx_ad_spend_day ON ad_spend(day);
