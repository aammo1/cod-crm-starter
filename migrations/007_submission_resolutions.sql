-- Attributed audit trail for CRM resolution of failed/uncertain courier
-- submissions (R7). Rows are append-only; the decision, actor and the agent's
-- portal-verification evidence are kept instead of ad-hoc SQL edits.
CREATE TABLE IF NOT EXISTS submission_resolutions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES courier_submissions(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  outcome TEXT NOT NULL CHECK(outcome IN ('parcel_exists','no_parcel')),
  previous_status TEXT NOT NULL,
  tracking_number TEXT,
  evidence TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submission_resolutions_submission
  ON submission_resolutions(submission_id, created_at);
