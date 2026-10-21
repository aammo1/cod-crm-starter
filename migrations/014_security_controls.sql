CREATE TABLE security_budgets (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX security_budgets_expiry ON security_budgets(expires_at);

CREATE TABLE security_audit (
  id INTEGER PRIMARY KEY,
  event TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX security_audit_created ON security_audit(created_at);
