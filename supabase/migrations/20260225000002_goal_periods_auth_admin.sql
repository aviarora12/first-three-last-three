-- =============================================================================
-- FocusLine — Goal Periods, Email Auth, Admin Invitations, Pacing Reminders
-- Migration: 20260225000002_goal_periods_auth_admin
--
-- What this adds:
--   1. User roles (admin / member) + title / job_description on profiles
--   2. Invitations table — admin sends invite, user signs up via token
--   3. Monthly / annual objective periods with auto-derived dates
--   4. Pacing reminders — scheduled pings (daily → biweekly) per objective
--   5. Admin-scoped RLS policies
--   6. is_admin() helper used throughout RLS
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'member');

CREATE TYPE objective_period AS ENUM ('monthly', 'annual', 'custom');

CREATE TYPE reminder_frequency AS ENUM ('daily', 'twice_weekly', 'weekly', 'biweekly');

-- =============================================================================
-- PROFILES — add role, title, job_description, invited_by
--
-- title + job_description feed the Catalyst suggestion engine so it can
-- match tasks to objectives that are relevant to this person's actual work.
-- =============================================================================

ALTER TABLE profiles
  ADD COLUMN role            user_role NOT NULL DEFAULT 'member',
  ADD COLUMN title           TEXT,
  ADD COLUMN job_description TEXT,
  ADD COLUMN invited_by      UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.role IS
  'admin: can invite users, manage objectives, see all logs. '
  'member: can only see their own logs and shared objectives.';
COMMENT ON COLUMN profiles.title IS
  'Job title (e.g. "Account Executive"). Used by Catalyst to rank task suggestions.';
COMMENT ON COLUMN profiles.job_description IS
  'Free-text description of responsibilities. Catalyst uses this to score '
  'objective relevance when surfacing suggested First Three tasks.';
COMMENT ON COLUMN profiles.invited_by IS
  'Profile ID of the admin who sent the invitation. NULL for the seed admin.';

-- =============================================================================
-- is_admin() — security-definer helper used in RLS policies
--
-- Defined as SECURITY DEFINER so it can read profiles even when the caller
-- would otherwise be blocked by RLS. This is safe because it only returns a
-- boolean and takes no user input.
-- =============================================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

COMMENT ON FUNCTION is_admin() IS
  'Returns TRUE if the currently authenticated user has role = admin. '
  'Used in RLS policies. SECURITY DEFINER so it can read profiles table.';

-- =============================================================================
-- INVITATIONS
--
-- Flow:
--   1. Admin calls create_invitation(email, title, job_description, role).
--   2. A row is inserted with a cryptographically random token.
--   3. The application emails the token URL to the invitee.
--   4. Invitee hits /signup?token=<token>, enters email + password.
--   5. Supabase creates auth.users row → handle_new_user() fires.
--   6. handle_new_user() detects the pending invitation, pre-populates profile.
--   7. accept_invitation() marks the invitation accepted.
-- =============================================================================

CREATE TABLE invitations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT NOT NULL,
  invited_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title           TEXT,
  job_description TEXT,
  department      TEXT NOT NULL DEFAULT '',
  role            user_role NOT NULL DEFAULT 'member',
  -- 64-char hex token generated from 32 random bytes — effectively unguessable
  token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT invitations_email_pending_unique
    EXCLUDE (email WITH =) WHERE (accepted_at IS NULL)
);

COMMENT ON TABLE invitations IS
  'Admin-created invitations. One pending invitation per email address at a time. '
  'Token is single-use and expires after 7 days.';
COMMENT ON COLUMN invitations.token IS
  'URL-safe 64-hex-char token. Embedded in the invitation link as ?token=<token>. '
  'Consumed on first use and invalidated after expires_at.';

-- =============================================================================
-- INVITATIONS — convenience functions
-- =============================================================================

-- Create an invitation (admin only — enforced in RLS below).
CREATE OR REPLACE FUNCTION create_invitation(
  p_email           TEXT,
  p_title           TEXT,
  p_job_description TEXT,
  p_department      TEXT,
  p_role            user_role DEFAULT 'member'
)
RETURNS invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inv invitations;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can create invitations';
  END IF;

  INSERT INTO invitations (email, invited_by, title, job_description, department, role)
  VALUES (lower(trim(p_email)), auth.uid(), p_title, p_job_description, p_department, p_role)
  RETURNING * INTO v_inv;

  RETURN v_inv;
END;
$$;

-- Mark an invitation accepted and propagate data to the profile.
-- Called after the user signs up using the token.
CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inv invitations;
BEGIN
  SELECT * INTO v_inv
  FROM invitations
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation token is invalid, already used, or expired';
  END IF;

  -- Stamp accepted
  UPDATE invitations
  SET accepted_at = NOW()
  WHERE id = v_inv.id;

  -- Hydrate the user's profile with the admin-supplied data
  UPDATE profiles
  SET
    title           = COALESCE(v_inv.title,           title),
    job_description = COALESCE(v_inv.job_description, job_description),
    department      = COALESCE(NULLIF(v_inv.department, ''), department),
    role            = v_inv.role,
    invited_by      = v_inv.invited_by
  WHERE id = p_user_id;
END;
$$;

-- =============================================================================
-- OBJECTIVES — add period_type, period_year, period_month
--
-- For 'monthly' and 'annual' periods the trigger below auto-derives
-- start_date and end_date, so callers only need to supply the period fields.
-- For 'custom' the caller sets start_date / end_date directly (existing behaviour).
-- =============================================================================

ALTER TABLE objectives
  ADD COLUMN period_type  objective_period NOT NULL DEFAULT 'custom',
  ADD COLUMN period_year  SMALLINT CHECK (period_year  BETWEEN 2020 AND 2099),
  ADD COLUMN period_month SMALLINT CHECK (period_month BETWEEN 1   AND 12);

COMMENT ON COLUMN objectives.period_type IS
  'monthly: goal resets each calendar month. '
  'annual: goal spans a full calendar year. '
  'custom: arbitrary start_date / end_date (legacy / special cases).';
COMMENT ON COLUMN objectives.period_year IS
  'Calendar year for monthly/annual goals. NULL for custom.';
COMMENT ON COLUMN objectives.period_month IS
  'Calendar month (1–12) for monthly goals. NULL for annual/custom.';

-- Constraint: monthly goals must have period_month; annual goals must not.
ALTER TABLE objectives
  ADD CONSTRAINT objectives_monthly_requires_month
    CHECK (period_type <> 'monthly' OR period_month IS NOT NULL),
  ADD CONSTRAINT objectives_annual_no_month
    CHECK (period_type <> 'annual'  OR period_month IS NULL),
  ADD CONSTRAINT objectives_period_requires_year
    CHECK (period_type = 'custom'   OR period_year IS NOT NULL);

-- Trigger: auto-derive start_date / end_date from period fields.
CREATE OR REPLACE FUNCTION derive_objective_dates()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.period_type = 'annual' THEN
    NEW.start_date := make_date(NEW.period_year::INT, 1, 1);
    NEW.end_date   := make_date(NEW.period_year::INT, 12, 31);

  ELSIF NEW.period_type = 'monthly' THEN
    NEW.start_date := make_date(NEW.period_year::INT, NEW.period_month::INT, 1);
    -- Last day of the month: first day of next month minus 1 day
    NEW.end_date   := (
      make_date(NEW.period_year::INT, NEW.period_month::INT, 1)
      + INTERVAL '1 month'
      - INTERVAL '1 day'
    )::DATE;
  END IF;
  -- For 'custom', start_date / end_date stay exactly as supplied.
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_objectives_derive_dates
  BEFORE INSERT OR UPDATE OF period_type, period_year, period_month
  ON objectives
  FOR EACH ROW
  EXECUTE FUNCTION derive_objective_dates();

-- Index for quickly fetching all objectives in a given year/month
CREATE INDEX idx_objectives_period
  ON objectives (period_type, period_year, period_month);

-- =============================================================================
-- PACING REMINDERS
--
-- One row per (objective, recipient) pair, controlling how often the admin
-- receives a "please update current_value" ping.
--
-- Supported frequencies:
--   daily        → next_due_at += 1 day
--   twice_weekly → next_due_at += 3 or 4 days (Mon/Thu rhythm)
--   weekly       → next_due_at += 7 days   ← default
--   biweekly     → next_due_at += 14 days
--
-- The external scheduler (pg_cron job or Edge Function running daily) calls
-- advance_reminder_schedule(reminder_id) after successfully dispatching each
-- notification, which stamps last_sent_at and rolls next_due_at forward.
-- =============================================================================

CREATE TABLE pacing_reminders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- NULL objective_id = "remind about ALL critical objectives" (catch-all reminder)
  objective_id     UUID REFERENCES objectives(id) ON DELETE CASCADE,
  recipient_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  frequency        reminder_frequency NOT NULL DEFAULT 'weekly',
  -- Slack channel / Teams webhook override; NULL falls back to the user's DM
  channel_override TEXT,
  last_sent_at     TIMESTAMPTZ,
  next_due_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pacing_reminders_recipient_objective_unique
    UNIQUE (recipient_id, objective_id)
);

COMMENT ON TABLE pacing_reminders IS
  'Controls how often an admin is pinged to update current_value on an objective. '
  'objective_id = NULL means "remind about any Critical/At-Risk objective."';
COMMENT ON COLUMN pacing_reminders.next_due_at IS
  'Reminders with next_due_at <= NOW() appear in the pacing_reminder_queue view. '
  'advance_reminder_schedule() rolls this forward after each dispatch.';
COMMENT ON COLUMN pacing_reminders.channel_override IS
  'Slack channel ID (e.g. #revenue-team) or Teams webhook URL. '
  'When set, the notification goes here instead of a DM to the recipient.';

CREATE TRIGGER trg_pacing_reminders_updated_at
  BEFORE UPDATE ON pacing_reminders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_pacing_reminders_due
  ON pacing_reminders (next_due_at)
  WHERE is_active = TRUE;

CREATE INDEX idx_pacing_reminders_recipient
  ON pacing_reminders (recipient_id)
  WHERE is_active = TRUE;

-- =============================================================================
-- advance_reminder_schedule()
--
-- Called by the notification dispatcher after successfully sending a reminder.
-- Updates last_sent_at and computes next_due_at based on frequency.
--
-- twice_weekly logic: alternates 3-day and 4-day gaps so reminders land
-- on Mon + Thu regardless of the starting day, approximating a Mon/Thu rhythm.
-- =============================================================================

CREATE OR REPLACE FUNCTION advance_reminder_schedule(p_reminder_id UUID)
RETURNS pacing_reminders
LANGUAGE plpgsql AS $$
DECLARE
  v_rem   pacing_reminders;
  v_now   TIMESTAMPTZ := NOW();
  v_next  TIMESTAMPTZ;
  v_days  INT;
BEGIN
  SELECT * INTO v_rem FROM pacing_reminders WHERE id = p_reminder_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reminder % not found', p_reminder_id;
  END IF;

  CASE v_rem.frequency
    WHEN 'daily'        THEN v_days := 1;
    WHEN 'twice_weekly' THEN
      -- Alternate 3 / 4 day gaps to approximate Mon + Thu cadence
      v_days := CASE WHEN EXTRACT(DOW FROM v_now) IN (1, 4) THEN 3 ELSE 4 END;
    WHEN 'weekly'       THEN v_days := 7;
    WHEN 'biweekly'     THEN v_days := 14;
  END CASE;

  v_next := v_now + (v_days || ' days')::INTERVAL;

  UPDATE pacing_reminders
  SET last_sent_at = v_now,
      next_due_at  = v_next
  WHERE id = p_reminder_id
  RETURNING * INTO v_rem;

  RETURN v_rem;
END;
$$;

-- =============================================================================
-- pacing_reminder_queue VIEW
--
-- Read by the Edge Function / pg_cron job to find reminders that are due.
-- Includes all the data needed to compose and dispatch the notification
-- without a second round-trip.
-- =============================================================================

CREATE OR REPLACE VIEW pacing_reminder_queue AS
SELECT
  pr.id                                        AS reminder_id,
  pr.recipient_id,
  p.full_name                                  AS recipient_name,
  p.slack_user_id,
  pr.channel_override,
  pr.frequency,
  pr.last_sent_at,
  pr.next_due_at,
  -- Objective details (NULL columns when objective_id is NULL = catch-all)
  o.id                                         AS objective_id,
  o.title                                      AS objective_title,
  o.status                                     AS objective_status,
  o.current_value,
  o.target_value,
  o.start_date,
  o.end_date,
  o.period_type,
  o.period_year,
  o.period_month,
  o.weight,
  -- Inline pacing score so the dispatcher can include it in the message
  CASE
    WHEN o.target_value IS NULL OR o.target_value = 0 THEN NULL
    ELSE ROUND(
      (o.current_value / o.target_value)
      / NULLIF(
          GREATEST(1, CURRENT_DATE - o.start_date)::NUMERIC
          / GREATEST(1, o.end_date - o.start_date)::NUMERIC,
          0
        ),
      4
    )
  END                                          AS pacing_score
FROM pacing_reminders pr
JOIN profiles p ON p.id = pr.recipient_id
LEFT JOIN objectives o ON o.id = pr.objective_id
WHERE pr.is_active = TRUE
  AND pr.next_due_at <= NOW()
ORDER BY pr.next_due_at ASC;

COMMENT ON VIEW pacing_reminder_queue IS
  'All pacing reminders that are currently due, enriched with objective + recipient '
  'data. Consumed by the daily Edge Function or pg_cron dispatch job. '
  'Call advance_reminder_schedule(reminder_id) after each successful send.';

-- =============================================================================
-- Updated handle_new_user()
--
-- Now checks for a pending invitation keyed on the user''s email.
-- If found, pre-populates title, job_description, department, role,
-- and invited_by — so the profile is fully formed on first login.
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_inv invitations;
BEGIN
  -- Check for a matching pending invitation
  SELECT * INTO v_inv
  FROM invitations
  WHERE lower(trim(email)) = lower(trim(NEW.email))
    AND accepted_at IS NULL
    AND expires_at > NOW()
  LIMIT 1;

  INSERT INTO profiles (
    id,
    full_name,
    avatar_url,
    role,
    title,
    job_description,
    department,
    invited_by
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'avatar_url',
    COALESCE(v_inv.role,            'member'),
    COALESCE(v_inv.title,           NULL),
    COALESCE(v_inv.job_description, NULL),
    COALESCE(v_inv.department,      ''),
    v_inv.invited_by   -- NULL if no invitation
  );

  -- Stamp the invitation accepted if one was found
  IF FOUND THEN
    UPDATE invitations SET accepted_at = NOW() WHERE id = v_inv.id;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- UPDATED RLS POLICIES
-- =============================================================================

-- ── profiles ─────────────────────────────────────────────────────────────────

-- Admins can read all profiles (needed for Command Center work-stream + invites)
CREATE POLICY "profiles: admin read all"
  ON profiles FOR SELECT
  USING (is_admin());

-- Admins can update any profile (to fix title / department / role)
CREATE POLICY "profiles: admin update any"
  ON profiles FOR UPDATE
  USING (is_admin());

-- ── invitations ───────────────────────────────────────────────────────────────

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Only admins can create invitations
CREATE POLICY "invitations: admin insert"
  ON invitations FOR INSERT
  WITH CHECK (is_admin() AND invited_by = auth.uid());

-- Admins can see all invitations (to track pending / accepted)
CREATE POLICY "invitations: admin read"
  ON invitations FOR SELECT
  USING (is_admin());

-- The invited user can read their own invitation (needed to accept it on signup)
CREATE POLICY "invitations: invitee read own"
  ON invitations FOR SELECT
  USING (lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())));

-- ── objectives ────────────────────────────────────────────────────────────────

-- Drop the old owner-only write policy and replace with admin write
DROP POLICY IF EXISTS "objectives: owner write" ON objectives;

CREATE POLICY "objectives: admin write"
  ON objectives FOR ALL
  USING (is_admin());

-- ── pacing_reminders ─────────────────────────────────────────────────────────

ALTER TABLE pacing_reminders ENABLE ROW LEVEL SECURITY;

-- Admins can manage all reminders
CREATE POLICY "pacing_reminders: admin all"
  ON pacing_reminders FOR ALL
  USING (is_admin());

-- Recipients can read their own reminders (so the UI can show "you'll be pinged weekly")
CREATE POLICY "pacing_reminders: recipient read own"
  ON pacing_reminders FOR SELECT
  USING (recipient_id = auth.uid());

-- ── daily_logs — admins can read all ─────────────────────────────────────────

CREATE POLICY "daily_logs: admin read all"
  ON daily_logs FOR SELECT
  USING (is_admin());

-- ── tasks — admins can read all ───────────────────────────────────────────────

CREATE POLICY "tasks: admin read all"
  ON tasks FOR SELECT
  USING (is_admin());

-- ── blockers — admins can read all ───────────────────────────────────────────

CREATE POLICY "blockers: admin read all"
  ON blockers FOR SELECT
  USING (is_admin());

-- =============================================================================
-- SEED: ensure the first admin can be designated via the Supabase dashboard.
--
-- After running this migration, go to Supabase → Authentication → Users,
-- find your admin user, then run:
--
--   UPDATE profiles SET role = 'admin' WHERE id = '<your-user-uuid>';
--
-- All subsequent users should be invited via the admin UI / create_invitation().
-- Email + password auth is the only method enabled — OAuth providers should
-- remain disabled in Supabase → Authentication → Providers.
-- =============================================================================
