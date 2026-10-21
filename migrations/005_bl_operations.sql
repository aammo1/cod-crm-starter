-- Fail rather than silently discard conflicting legacy courier attachments.
CREATE UNIQUE INDEX idx_delivery_note_parcel_unique ON delivery_note_parcels(submission_id);

CREATE TABLE bl_operations (
  id TEXT PRIMARY KEY,
  delivery_note_id TEXT UNIQUE REFERENCES delivery_notes(id),
  status TEXT NOT NULL CHECK(status IN ('ready','running','needs_review','completed','abandoned')),
  stage TEXT NOT NULL CHECK(stage IN ('create','attach','save','done')),
  revision INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_expires_at TEXT,
  observed_ref TEXT,
  last_error TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((status IN ('completed','abandoned')) = (stage = 'done'))
);
CREATE TABLE bl_operation_parcels (
  submission_id TEXT PRIMARY KEY REFERENCES courier_submissions(id),
  operation_id TEXT NOT NULL REFERENCES bl_operations(id),
  tracking_number TEXT NOT NULL,
  attached_at TEXT
);
CREATE INDEX idx_bl_operation_parcels ON bl_operation_parcels(operation_id);
CREATE TABLE bl_operation_events (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES bl_operations(id),
  stage TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('claimed','started','succeeded','uncertain','reconciled')),
  actor TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_bl_operation_events ON bl_operation_events(operation_id, created_at);

-- Existing draft calls may already have taken effect. Do not auto-replay them.
INSERT INTO bl_operations
  (id, delivery_note_id, status, stage, last_error, created_by, created_at, updated_at)
SELECT 'legacy:' || dn.id, dn.id,
       CASE WHEN dn.status = 'saved' THEN 'completed' ELSE 'needs_review' END,
       CASE WHEN dn.status = 'saved' THEN 'done'
            WHEN EXISTS (SELECT 1 FROM delivery_note_parcels p WHERE p.delivery_note_id = dn.id) THEN 'save'
            ELSE 'attach' END,
       CASE WHEN dn.status = 'saved' THEN NULL ELSE 'Ancien BL : vérifiez son état dans le portail Ozon avant de continuer.' END,
       COALESCE(dn.created_by, 'migration'), dn.created_at, dn.created_at
FROM delivery_notes dn;
INSERT INTO bl_operation_parcels (submission_id, operation_id, tracking_number, attached_at)
SELECT p.submission_id, 'legacy:' || p.delivery_note_id, COALESCE(cs.tracking_number, ''), p.added_at
FROM delivery_note_parcels p JOIN courier_submissions cs ON cs.id = p.submission_id;
CREATE UNIQUE INDEX idx_bl_claim_tracking ON bl_operation_parcels(tracking_number) WHERE tracking_number != '';
