-- =============================================================================
-- FocusLine — Strategic Goal Tying Schema
-- Migration: 20260225000001_initial_schema
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE objective_status AS ENUM ('On-Track', 'At-Risk', 'Critical');

CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'complete', 'incomplete');

-- =============================================================================
-- PROFILES
-- Extends Supabase auth.users with app-level fields.
-- department is needed for the Catalyst suggestion engine.
-- =============================================================================

CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  avatar_url    TEXT,
  department    TEXT NOT NULL DEFAULT '',
  slack_user_id TEXT,                      -- for Slack DM / status integration
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS
  'App-level user profile extending auth.users. One row per authenticated user.';

-- =============================================================================
-- OBJECTIVES
-- Top-level strategic goals that tasks are tied to.
-- Pacing is computed server-side and stored back into status + current_value.
-- =============================================================================

CREATE TABLE objectives (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT        NOT NULL,
  description   TEXT,
  department    TEXT        NOT NULL DEFAULT '',   -- matches profiles.department for Catalyst
  weight        INT         NOT NULL DEFAULT 1     -- relative priority weight (1–10)
                            CHECK (weight BETWEEN 1 AND 10),
  target_value  NUMERIC(12, 4) NOT NULL CHECK (target_value > 0),
  current_value NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  status        objective_status NOT NULL DEFAULT 'On-Track',
  start_date    DATE        NOT NULL,
  end_date      DATE        NOT NULL CHECK (end_date > start_date),
  owner_id      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE objectives IS
  'Strategic objectives. PacingScore = (current_value / target_value) / (days_elapsed / total_days). '
  'Status is recomputed by the pacing utility and written back here.';
COMMENT ON COLUMN objectives.weight IS
  'Priority weight 1–10. Used by Catalyst to rank suggested tasks.';
COMMENT ON COLUMN objectives.status IS
  'Managed by pacing engine: On-Track (score ≥ 1.0), At-Risk (0.8–1.0), Critical (< 0.8).';

-- =============================================================================
-- DAILY LOGS
-- One row per (user, date). Anchors First Three / Last Three entries.
-- =============================================================================

CREATE TABLE daily_logs (
  id                UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date              DATE  NOT NULL,
  f3_completed_at   TIMESTAMPTZ,   -- timestamp when First Three were locked in
  l3_completed_at   TIMESTAMPTZ,   -- timestamp when Last Three were submitted
  rollover_count    INT  NOT NULL DEFAULT 0,  -- how many tasks rolled over from prior day
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT daily_logs_user_date_unique UNIQUE (user_id, date)
);

COMMENT ON TABLE daily_logs IS
  'One log per (user, calendar date). Owns all tasks for that day.';
COMMENT ON COLUMN daily_logs.f3_completed_at IS
  'Set when the user locks in their First Three. NULL = not yet committed.';
COMMENT ON COLUMN daily_logs.l3_completed_at IS
  'Set when the user submits their Last Three. NULL = day not closed.';
COMMENT ON COLUMN daily_logs.rollover_count IS
  'Number of incomplete tasks carried forward from the previous day. Feeds the Rollover Penalty stat.';

-- =============================================================================
-- TASKS
-- Individual work items within a daily log, optionally tied to an objective.
-- =============================================================================

CREATE TABLE tasks (
  id            UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_id        UUID  NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  description   TEXT  NOT NULL,
  objective_id  UUID  REFERENCES objectives(id) ON DELETE SET NULL,
  status        task_status NOT NULL DEFAULT 'pending',
  artifact_url  TEXT,                    -- URL to deliverable; required to close day
  is_suggested  BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = inserted by Catalyst engine
  position      SMALLINT NOT NULL DEFAULT 0,     -- 0-2 for F3, 3-5 for L3
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tasks IS
  'Work items inside a daily_log. position 0–2 = First Three, 3–5 = Last Three.';
COMMENT ON COLUMN tasks.artifact_url IS
  'User must supply this URL before the day can be closed. NULL triggers Rollover Penalty.';
COMMENT ON COLUMN tasks.is_suggested IS
  'TRUE when the Catalyst engine auto-populated this task based on objective pacing.';

-- =============================================================================
-- BLOCKERS
-- Many-to-one on tasks: a task may be blocked by one or more users.
-- =============================================================================

CREATE TABLE blockers (
  id               UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocked_task_id  UUID  NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocking_user_id UUID  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resolution_eta   TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,        -- NULL = still open
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT blockers_task_user_unique UNIQUE (blocked_task_id, blocking_user_id)
);

COMMENT ON TABLE blockers IS
  'Links a blocked task to the user whose action is required to unblock it. '
  'Catalyst queries open blockers (resolved_at IS NULL) to surface priority alerts.';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Objectives: department lookup for Catalyst, status filter for pacing sweeps
CREATE INDEX idx_objectives_department ON objectives (department);
CREATE INDEX idx_objectives_status     ON objectives (status);
CREATE INDEX idx_objectives_owner      ON objectives (owner_id);

-- Daily logs: date range queries and user lookups
CREATE INDEX idx_daily_logs_user_date  ON daily_logs (user_id, date DESC);

-- Tasks: join to log; filter by objective; find open suggested tasks
CREATE INDEX idx_tasks_log_id          ON tasks (log_id);
CREATE INDEX idx_tasks_objective_id    ON tasks (objective_id);
CREATE INDEX idx_tasks_status          ON tasks (status);
CREATE INDEX idx_tasks_is_suggested    ON tasks (is_suggested) WHERE is_suggested = TRUE;

-- Blockers: find open blockers by blocking user (Catalyst Query 1)
CREATE INDEX idx_blockers_blocking_user
  ON blockers (blocking_user_id)
  WHERE resolved_at IS NULL;

-- Blockers: find all open blockers for a task
CREATE INDEX idx_blockers_blocked_task
  ON blockers (blocked_task_id)
  WHERE resolved_at IS NULL;

-- =============================================================================
-- UPDATED_AT TRIGGER
-- Keeps updated_at current on every row mutation.
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_objectives_updated_at
  BEFORE UPDATE ON objectives
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_daily_logs_updated_at
  BEFORE UPDATE ON daily_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_blockers_updated_at
  BEFORE UPDATE ON blockers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- AUTO-CREATE PROFILE ON SIGN-UP
-- Fires after a new row is inserted into auth.users.
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- PACING STATUS UPDATER (Database-Side)
-- Called by the server-side pacing utility OR a scheduled pg_cron job.
-- Recomputes status for every active objective in one sweep.
--
-- PacingScore = (current_value / target_value) / (days_elapsed / total_days)
--   >= 1.0  → On-Track
--   >= 0.8  → At-Risk
--    < 0.8  → Critical
-- =============================================================================

CREATE OR REPLACE FUNCTION recompute_objective_statuses()
RETURNS TABLE (
  objective_id UUID,
  pacing_score NUMERIC,
  new_status   objective_status
)
LANGUAGE plpgsql AS $$
DECLARE
  today         DATE := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH pacing AS (
    SELECT
      o.id,
      o.current_value,
      o.target_value,
      o.start_date,
      o.end_date,
      -- days_elapsed: clamp to [1, total_days] to avoid division-by-zero on day 0
      GREATEST(1, today - o.start_date)::NUMERIC                          AS days_elapsed,
      GREATEST(1, o.end_date - o.start_date)::NUMERIC                     AS total_days,
      ROUND(
        (o.current_value / NULLIF(o.target_value, 0))
        /
        NULLIF(
          GREATEST(1, today - o.start_date)::NUMERIC
          / GREATEST(1, o.end_date - o.start_date)::NUMERIC,
          0
        ),
        4
      )                                                                    AS pacing_score
    FROM objectives o
    WHERE today BETWEEN o.start_date AND o.end_date  -- only active objectives
  ),
  classified AS (
    SELECT
      p.id,
      p.pacing_score,
      CASE
        WHEN p.pacing_score >= 1.0 THEN 'On-Track'::objective_status
        WHEN p.pacing_score >= 0.8 THEN 'At-Risk'::objective_status
        ELSE                             'Critical'::objective_status
      END AS computed_status
    FROM pacing p
  )
  UPDATE objectives o
  SET    status = c.computed_status
  FROM   classified c
  WHERE  o.id = c.id
    AND  o.status IS DISTINCT FROM c.computed_status  -- skip no-op writes
  RETURNING o.id, c.pacing_score, c.computed_status;
END;
$$;

COMMENT ON FUNCTION recompute_objective_statuses() IS
  'Sweeps all active objectives, recomputes PacingScore, and writes back status. '
  'Returns only rows whose status changed. Safe to call from pg_cron or the API.';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockers   ENABLE ROW LEVEL SECURITY;

-- profiles: users see and edit only their own row
CREATE POLICY "profiles: read own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: update own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- objectives: all authenticated users can read objectives
CREATE POLICY "objectives: authenticated read"
  ON objectives FOR SELECT
  TO authenticated
  USING (TRUE);

-- objectives: only the owner (or service role) can mutate
CREATE POLICY "objectives: owner write"
  ON objectives FOR ALL
  USING (auth.uid() = owner_id);

-- daily_logs: users see only their own logs
CREATE POLICY "daily_logs: read own"
  ON daily_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "daily_logs: insert own"
  ON daily_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "daily_logs: update own"
  ON daily_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- tasks: scoped through daily_log ownership
CREATE POLICY "tasks: read own"
  ON tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM daily_logs dl
      WHERE dl.id = tasks.log_id AND dl.user_id = auth.uid()
    )
  );

CREATE POLICY "tasks: write own"
  ON tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM daily_logs dl
      WHERE dl.id = tasks.log_id AND dl.user_id = auth.uid()
    )
  );

-- blockers: blocking user and task owner can read
CREATE POLICY "blockers: read involved"
  ON blockers FOR SELECT
  USING (
    blocking_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM tasks t
      JOIN daily_logs dl ON dl.id = t.log_id
      WHERE t.id = blockers.blocked_task_id
        AND dl.user_id = auth.uid()
    )
  );

CREATE POLICY "blockers: write own"
  ON blockers FOR ALL
  USING (
    blocking_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM tasks t
      JOIN daily_logs dl ON dl.id = t.log_id
      WHERE t.id = blockers.blocked_task_id
        AND dl.user_id = auth.uid()
    )
  );

-- =============================================================================
-- WORK-STREAM VIEW
-- Powers the Command Center real-time ticker.
-- Shows every user's current in-progress task and which objective it supports.
-- =============================================================================

CREATE OR REPLACE VIEW work_stream AS
SELECT
  p.id           AS user_id,
  p.full_name,
  p.department,
  t.id           AS task_id,
  t.description  AS task_description,
  t.status       AS task_status,
  o.id           AS objective_id,
  o.title        AS objective_title,
  o.status       AS objective_status,
  o.weight       AS objective_weight,
  dl.date        AS log_date
FROM profiles p
JOIN daily_logs dl ON dl.user_id = p.id AND dl.date = CURRENT_DATE
JOIN tasks t       ON t.log_id = dl.id AND t.status = 'in_progress'
LEFT JOIN objectives o ON o.id = t.objective_id;

COMMENT ON VIEW work_stream IS
  'Real-time snapshot of what every user is working on right now and which objective it supports. '
  'Subscribe via Supabase Realtime on tasks table to keep this current.';
