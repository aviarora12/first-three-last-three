// =============================================================================
// FocusLine — Core Domain Types
// Mirror of the Supabase schema for use throughout the application.
// =============================================================================

export type ObjectiveStatus = 'On-Track' | 'At-Risk' | 'Critical';
export type TaskStatus = 'pending' | 'in_progress' | 'complete' | 'incomplete';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string;
  slack_user_id: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Objective {
  id: string;
  title: string;
  description: string | null;
  department: string;
  weight: number;          // 1–10
  target_value: number;
  current_value: number;
  status: ObjectiveStatus;
  start_date: string;      // ISO date 'YYYY-MM-DD'
  end_date: string;        // ISO date 'YYYY-MM-DD'
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyLog {
  id: string;
  user_id: string;
  date: string;            // ISO date 'YYYY-MM-DD'
  f3_completed_at: string | null;
  l3_completed_at: string | null;
  rollover_count: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  log_id: string;
  description: string;
  objective_id: string | null;
  status: TaskStatus;
  artifact_url: string | null;
  is_suggested: boolean;
  position: number;        // 0–2 = F3, 3–5 = L3
  created_at: string;
  updated_at: string;
}

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

// Returned by recomputeObjectiveStatuses when statuses change
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
