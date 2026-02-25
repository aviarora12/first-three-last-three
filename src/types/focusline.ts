// =============================================================================
// FocusLine — Core Domain Types
// Mirror of the Supabase schema for use throughout the application.
// =============================================================================

export type ObjectiveStatus   = 'On-Track' | 'At-Risk' | 'Critical';
export type TaskStatus        = 'pending' | 'in_progress' | 'complete' | 'incomplete';
export type UserRole          = 'admin' | 'member';
export type ObjectivePeriod   = 'monthly' | 'annual' | 'custom';
export type ReminderFrequency = 'daily' | 'twice_weekly' | 'weekly' | 'biweekly';

// =============================================================================
// Profiles
// =============================================================================

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string;
  slack_user_id: string | null;
  timezone: string;
  // New in migration 002
  role: UserRole;
  title: string | null;
  job_description: string | null;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Objectives
// =============================================================================

export interface Objective {
  id: string;
  title: string;
  description: string | null;
  department: string;
  weight: number;            // 1–10
  target_value: number;
  current_value: number;
  status: ObjectiveStatus;
  // Dates are auto-derived for monthly/annual; set directly for custom.
  start_date: string;        // ISO date 'YYYY-MM-DD'
  end_date: string;          // ISO date 'YYYY-MM-DD'
  // Period metadata (new in migration 002)
  period_type: ObjectivePeriod;
  period_year: number | null;    // required for monthly + annual
  period_month: number | null;   // 1–12; required for monthly only
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Shorthand to create the right period fields for each objective type. */
export type MonthlyObjectiveInput = Omit<
  Objective,
  'id' | 'status' | 'start_date' | 'end_date' | 'period_type' | 'created_at' | 'updated_at'
> & {
  period_type: 'monthly';
  period_year: number;
  period_month: number;  // 1–12
};

export type AnnualObjectiveInput = Omit<
  Objective,
  'id' | 'status' | 'start_date' | 'end_date' | 'period_type' | 'period_month' | 'created_at' | 'updated_at'
> & {
  period_type: 'annual';
  period_year: number;
  period_month: null;
};

export type CustomObjectiveInput = Omit<
  Objective,
  'id' | 'status' | 'period_type' | 'period_year' | 'period_month' | 'created_at' | 'updated_at'
> & {
  period_type: 'custom';
  period_year: null;
  period_month: null;
};

export type ObjectiveInput =
  | MonthlyObjectiveInput
  | AnnualObjectiveInput
  | CustomObjectiveInput;

// =============================================================================
// Daily Logs
// =============================================================================

export interface DailyLog {
  id: string;
  user_id: string;
  date: string;              // ISO date 'YYYY-MM-DD'
  f3_completed_at: string | null;
  l3_completed_at: string | null;
  rollover_count: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Tasks
// =============================================================================

export interface Task {
  id: string;
  log_id: string;
  description: string;
  objective_id: string | null;
  status: TaskStatus;
  artifact_url: string | null;
  is_suggested: boolean;
  position: number;          // 0–2 = F3, 3–5 = L3
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Blockers
// =============================================================================

export interface Blocker {
  id: string;
  blocked_task_id: string;
  blocking_user_id: string;
  resolution_eta: string | null;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Invitations
// =============================================================================

export interface Invitation {
  id: string;
  email: string;
  invited_by: string;        // Profile.id of the admin sender
  title: string | null;
  job_description: string | null;
  department: string;
  role: UserRole;
  token: string;             // 64-char hex; used in the signup link
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

/** Shape used by the admin UI to create an invitation. */
export interface InvitationInput {
  email: string;
  title: string;
  job_description: string;
  department: string;
  role: UserRole;
}

/** Status the UI can display for a given invitation. */
export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export function invitationStatus(inv: Invitation): InvitationStatus {
  if (inv.accepted_at) return 'accepted';
  if (new Date(inv.expires_at) < new Date()) return 'expired';
  return 'pending';
}

// =============================================================================
// Pacing Reminders
// =============================================================================

export interface PacingReminder {
  id: string;
  objective_id: string | null;  // NULL = catch-all reminder for any critical obj
  recipient_id: string;
  frequency: ReminderFrequency;
  channel_override: string | null;
  last_sent_at: string | null;
  next_due_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Row returned by the pacing_reminder_queue view (includes joined data). */
export interface PacingReminderQueueEntry {
  reminder_id: string;
  recipient_id: string;
  recipient_name: string | null;
  slack_user_id: string | null;
  channel_override: string | null;
  frequency: ReminderFrequency;
  last_sent_at: string | null;
  next_due_at: string;
  // Objective (nullable for catch-all reminders)
  objective_id: string | null;
  objective_title: string | null;
  objective_status: ObjectiveStatus | null;
  current_value: number | null;
  target_value: number | null;
  start_date: string | null;
  end_date: string | null;
  period_type: ObjectivePeriod | null;
  period_year: number | null;
  period_month: number | null;
  weight: number | null;
  pacing_score: number | null;
}

/** Human-readable labels for frequency options used in the admin UI. */
export const REMINDER_FREQUENCY_LABELS: Record<ReminderFrequency, string> = {
  daily:        'Daily',
  twice_weekly: 'Twice a week (Mon / Thu)',
  weekly:       'Once a week',
  biweekly:     'Every two weeks',
};

// =============================================================================
// Pacing Types
// =============================================================================

export interface PacingInput {
  currentValue: number;
  targetValue: number;
  /** ISO date string or Date object for when the objective period started */
  startDate: string | Date;
  /** ISO date string or Date object for when the objective period ends */
  endDate: string | Date;
  /** Optional: override "today" — useful for testing and back-fills */
  asOf?: string | Date;
}

export interface PacingResult {
  /** Raw pacing score. 1.0 = exactly on pace. */
  score: number;
  /** Derived status based on thresholds. */
  status: ObjectiveStatus;
  /** Percentage of the time window elapsed (0–100). */
  timeElapsedPct: number;
  /** Percentage of the target value achieved (0–100+). */
  progressPct: number;
  /** Days remaining until end_date. */
  daysRemaining: number;
  /** Total calendar days in the objective window. */
  totalDays: number;
  /** Days elapsed since start_date. */
  daysElapsed: number;
  /**
   * How much current_value must increase per remaining day to
   * hit target_value by end_date. 0 if already complete.
   */
  requiredDailyRate: number;
}

export interface ObjectiveWithPacing extends Objective {
  pacing: PacingResult;
}

/** Returned by recomputeObjectiveStatuses when a status changes. */
export interface StatusChange {
  objectiveId: string;
  previousStatus: ObjectiveStatus;
  newStatus: ObjectiveStatus;
  pacingScore: number;
}

// =============================================================================
// Work-Stream View (read-only)
// =============================================================================

export interface WorkStreamEntry {
  user_id: string;
  full_name: string | null;
  department: string;
  task_id: string;
  task_description: string;
  task_status: TaskStatus;
  objective_id: string | null;
  objective_title: string | null;
  objective_status: ObjectiveStatus | null;
  objective_weight: number | null;
  log_date: string;
}
