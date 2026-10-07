-- ActivityOps data model (spec v7 sec. 23).
--
-- Two structural rules are enforced here rather than left to application code:
--   1. verification_run has NO status column. Run status is derived (sec. 11).
--   2. ring_evidence_claim.ring_event_id is UNIQUE, so one provider event can
--      be claimed by at most one verification attempt (sec. 8.8).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  timezone  TEXT NOT NULL,
  enabled   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS device (
  id                 TEXT PRIMARY KEY,
  site_id            TEXT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  provider_device_id TEXT NOT NULL UNIQUE,
  label              TEXT NOT NULL,
  required_for_open  INTEGER NOT NULL DEFAULT 0,
  required_for_close INTEGER NOT NULL DEFAULT 0,
  criticality        TEXT NOT NULL DEFAULT 'STANDARD',
  -- UNKNOWN until discovery has actually reported on the device. UNKNOWN is not
  -- UNAVAILABLE: only a confirmed unavailable device may produce a BLOCKER (sec. 10 Case A).
  status             TEXT NOT NULL DEFAULT 'UNKNOWN'
                       CHECK (status IN ('UNKNOWN', 'AVAILABLE', 'UNAVAILABLE')),
  last_status_at     TEXT
);

CREATE TABLE IF NOT EXISTS verification_template (
  id           TEXT PRIMARY KEY,
  site_id      TEXT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('OPENING', 'CLOSING', 'HANDOVER')),
  start_time   TEXT,
  end_time     TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS verification_check (
  id                     TEXT PRIMARY KEY,
  template_id            TEXT NOT NULL REFERENCES verification_template(id) ON DELETE CASCADE,
  device_id              TEXT REFERENCES device(id) ON DELETE RESTRICT,
  label                  TEXT NOT NULL,
  requirement_type       TEXT NOT NULL CHECK (requirement_type IN ('RING_REQUIRED', 'NON_RING')),
  required               INTEGER NOT NULL DEFAULT 1,
  session_window_seconds INTEGER NOT NULL DEFAULT 600,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  -- A Ring-backed check is meaningless without a device to bind evidence to (sec. 8.6).
  CHECK (requirement_type = 'NON_RING' OR device_id IS NOT NULL)
);

-- No status column by design (sec. 23: "No manually editable run status field").
CREATE TABLE IF NOT EXISTS verification_run (
  id                TEXT PRIMARY KEY,
  template_id       TEXT NOT NULL REFERENCES verification_template(id) ON DELETE RESTRICT,
  scheduled_context TEXT,
  started_at        TEXT,
  completed_at      TEXT,
  operator_id       TEXT,
  approval_actor_id TEXT,
  approved_at       TEXT,
  cancelled_at      TEXT
);

-- Immutable (sec. 7). A recheck INSERTs a new row pointing at the one it supersedes;
-- nothing ever UPDATEs a historical attempt. Enforced by triggers below.
CREATE TABLE IF NOT EXISTS verification_attempt (
  id                    TEXT PRIMARY KEY,
  run_id                TEXT NOT NULL REFERENCES verification_run(id) ON DELETE CASCADE,
  check_id              TEXT NOT NULL REFERENCES verification_check(id) ON DELETE RESTRICT,
  attempt_number        INTEGER NOT NULL,
  status                TEXT NOT NULL
                          CHECK (status IN ('IN_PROGRESS', 'PASS', 'FAIL', 'OVERRIDDEN', 'CANCELLED')),
  reason                TEXT,
  ring_event_id         TEXT REFERENCES ring_event(id) ON DELETE RESTRICT,
  -- Server timestamp recorded when the operator explicitly starts the Ring step (sec. 8.1).
  -- Never inferred from page render time.
  armed_at              TEXT,
  -- The window in force for THIS attempt, snapshotted at arm time so later
  -- configuration changes cannot retroactively alter historical evidence.
  window_seconds        INTEGER,
  skew_seconds          INTEGER,
  attested_by           TEXT,
  attested_at           TEXT,
  created_at            TEXT NOT NULL,
  supersedes_attempt_id TEXT REFERENCES verification_attempt(id) ON DELETE RESTRICT,
  override_type         TEXT CHECK (override_type IS NULL OR override_type IN ('MANAGER_OVERRIDE')),
  override_reason       TEXT,
  approved_by           TEXT,
  approved_at           TEXT,
  UNIQUE (run_id, check_id, attempt_number),
  -- An override is never a PASS (sec. 13). It carries an approver and a mandatory reason.
  CHECK (status <> 'OVERRIDDEN' OR (override_type IS NOT NULL
                                    AND override_reason IS NOT NULL
                                    AND approved_by IS NOT NULL
                                    AND approved_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_attempt_run_check ON verification_attempt(run_id, check_id);

-- Normalized provider facts only. Raw payloads are not persisted (sec. 16).
CREATE TABLE IF NOT EXISTS ring_event (
  id                TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL UNIQUE,
  device_id         TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,
  start_at          TEXT NOT NULL,
  end_at            TEXT,
  is_simulated      INTEGER NOT NULL DEFAULT 0,
  -- Set when the event fell inside a media-operation correlation window and so
  -- cannot satisfy the Ring session gate (sec. 8.9).
  is_ambiguous      INTEGER NOT NULL DEFAULT 0,
  normalized_facts  TEXT,
  observed_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ring_event_device_start ON ring_event(device_id, start_at DESC);

-- One-to-one claim (sec. 8.8): the UNIQUE constraint is the enforcement, not a convention.
CREATE TABLE IF NOT EXISTS ring_evidence_claim (
  id            TEXT PRIMARY KEY,
  ring_event_id TEXT NOT NULL UNIQUE REFERENCES ring_event(id) ON DELETE CASCADE,
  attempt_id    TEXT NOT NULL REFERENCES verification_attempt(id) ON DELETE CASCADE,
  claimed_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_cursor (
  id                      TEXT PRIMARY KEY,
  device_id               TEXT NOT NULL UNIQUE REFERENCES device(id) ON DELETE CASCADE,
  next_url                TEXT,          -- diagnostic only; never the authoritative resume point
  last_observed_event_id  TEXT,
  last_success_at         TEXT,
  repeated_next_url_count INTEGER NOT NULL DEFAULT 0,
  error_count             INTEGER NOT NULL DEFAULT 0,
  last_sync_id            TEXT
);

-- Records that a sync actually covered a check window (sec. 9.4). Without a row
-- here, a missing session is "not yet observed", never negative evidence.
CREATE TABLE IF NOT EXISTS sync_coverage (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  attempt_id     TEXT NOT NULL REFERENCES verification_attempt(id) ON DELETE CASCADE,
  covered_from   TEXT NOT NULL,
  covered_to     TEXT NOT NULL,
  synced_at      TEXT NOT NULL,
  reached_older  INTEGER NOT NULL DEFAULT 0,  -- traversal passed records older than eligible_start
  UNIQUE (attempt_id)
);

CREATE TABLE IF NOT EXISTS incident (
  id               TEXT PRIMARY KEY,
  check_id         TEXT NOT NULL REFERENCES verification_check(id) ON DELETE CASCADE,
  run_id           TEXT REFERENCES verification_run(id) ON DELETE SET NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('BLOCKER', 'HIGH', 'MEDIUM', 'LOW')),
  status           TEXT NOT NULL CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'ACTION_REQUIRED',
                                                   'RECHECKING', 'READY_TO_RESOLVE', 'RESOLVED',
                                                   'DISMISSED')),
  reason           TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  resolved_at      TEXT,
  resolved_by      TEXT,
  dismissed_at     TEXT,
  dismissed_reason TEXT,
  CHECK (status <> 'DISMISSED' OR dismissed_reason IS NOT NULL),
  -- Resolution requires an explicit human approver (sec. 13/14).
  CHECK (status <> 'RESOLVED' OR resolved_by IS NOT NULL)
);

-- At most one open incident per check (sec. 13). A partial unique index makes
-- the rule structural rather than a race-prone application check.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_incident_per_check
  ON incident(check_id) WHERE status NOT IN ('RESOLVED', 'DISMISSED');

CREATE TABLE IF NOT EXISTS incident_action (
  id          TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incident(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  reason      TEXT,
  actor       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- Generated output only. Raw prompts are not persisted (sec. 16/23).
CREATE TABLE IF NOT EXISTS ai_interaction (
  id                 TEXT PRIMARY KEY,
  run_id             TEXT REFERENCES verification_run(id) ON DELETE CASCADE,
  type               TEXT NOT NULL,
  tool_trace_summary TEXT,
  response           TEXT,
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  timestamp   TEXT NOT NULL,
  metadata    TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

-- Integration health is observed separately from site evidence (sec. 10/11), so a
-- token expiry can never be mistaken for a coverage failure.
CREATE TABLE IF NOT EXISTS integration_state (
  id            TEXT PRIMARY KEY CHECK (id = 'ring'),
  state         TEXT NOT NULL CHECK (state IN ('HEALTHY', 'RECONNECT_REQUIRED')),
  detail        TEXT,
  observed_at   TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Immutability triggers (sec. 7). A failed attempt is never overwritten by a
-- later recheck; the only mutation an attempt ever receives is its one-time
-- transition out of IN_PROGRESS when the operator attests.
-- ---------------------------------------------------------------------------

CREATE TRIGGER IF NOT EXISTS trg_attempt_no_reattest
BEFORE UPDATE ON verification_attempt
FOR EACH ROW WHEN OLD.status <> 'IN_PROGRESS'
BEGIN
  SELECT RAISE(ABORT, 'verification_attempt is immutable once attested; create a new attempt');
END;

CREATE TRIGGER IF NOT EXISTS trg_attempt_no_history_rewrite
BEFORE UPDATE ON verification_attempt
FOR EACH ROW WHEN OLD.id <> NEW.id
                 OR OLD.run_id <> NEW.run_id
                 OR OLD.check_id <> NEW.check_id
                 OR OLD.attempt_number <> NEW.attempt_number
                 OR OLD.created_at <> NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'verification_attempt identity and lineage are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_attempt_no_delete
BEFORE DELETE ON verification_attempt
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'verification_attempt rows are retained for audit; cancel instead of deleting');
END;
