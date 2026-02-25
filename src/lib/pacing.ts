/**
 * FocusLine — Pacing Logic Utility
 *
 * Implements the Strategic Goal Tying pacing model:
 *
 *   PacingScore = (current_value / target_value) / (days_elapsed / total_days)
 *
 * Thresholds:
 *   score >= 1.0  →  'On-Track'
 *   score >= 0.8  →  'At-Risk'
 *   score <  0.8  →  'Critical'
 *
 * All functions are pure (no side effects, no I/O) so they can run
 * on the client, on the server, or inside edge functions without change.
 */

import {
  type Objective,
  type ObjectiveStatus,
  type ObjectiveWithPacing,
  type PacingInput,
  type PacingResult,
  type StatusChange,
} from '@/types/focusline';

// =============================================================================
// Constants
// =============================================================================

/** Objectives at or above this score are 'On-Track'. */
export const PACING_ON_TRACK_THRESHOLD = 1.0;

/** Objectives at or above this score (but below On-Track) are 'At-Risk'. */
export const PACING_AT_RISK_THRESHOLD = 0.8;

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Normalise a value that may be a Date object, an ISO string, or a plain
 * 'YYYY-MM-DD' string into a UTC midnight Date, avoiding timezone shifts.
 */
function toUTCDate(value: string | Date): Date {
  if (value instanceof Date) {
    // Strip time component to get a clean calendar day in UTC.
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  // 'YYYY-MM-DD' — new Date('YYYY-MM-DD') is treated as UTC by spec.
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new RangeError(`Invalid date value: "${value}"`);
  }
  return d;
}

/** Difference in whole calendar days between two UTC-midnight Dates. */
function daysDiff(a: Date, b: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

// =============================================================================
// Core pacing calculation
// =============================================================================

/**
 * Calculate the pacing score and all derived metrics for a single objective.
 *
 * @example
 * ```ts
 * const result = calculatePacing({
 *   currentValue: 45,
 *   targetValue:  100,
 *   startDate:   '2026-01-01',
 *   endDate:     '2026-03-31',
 * });
 * // result.score    → e.g. 0.74
 * // result.status   → 'Critical'
 * ```
 */
export function calculatePacing(input: PacingInput): PacingResult {
  const { currentValue, targetValue } = input;

  if (targetValue <= 0) {
    throw new RangeError(`targetValue must be > 0, received ${targetValue}`);
  }
  if (currentValue < 0) {
    throw new RangeError(`currentValue must be >= 0, received ${currentValue}`);
  }

  const startDate = toUTCDate(input.startDate);
  const endDate   = toUTCDate(input.endDate);
  const asOf      = input.asOf ? toUTCDate(input.asOf) : toUTCDate(new Date().toISOString().slice(0, 10));

  if (endDate <= startDate) {
    throw new RangeError('endDate must be after startDate');
  }

  const totalDays    = daysDiff(startDate, endDate);
  const daysElapsed  = Math.max(1, Math.min(daysDiff(startDate, asOf), totalDays)); // clamp [1, totalDays]
  const daysRemaining = Math.max(0, daysDiff(asOf, endDate));

  // Core formula
  const progressRatio = currentValue / targetValue;          // 0 → 1+ (can exceed 1 if over target)
  const timeRatio     = daysElapsed / totalDays;             // always 0.001…1
  const score         = progressRatio / timeRatio;

  const status = deriveStatus(score);

  const progressPct     = Math.round(progressRatio * 10_000) / 100;  // 2 decimal places
  const timeElapsedPct  = Math.round(timeRatio     * 10_000) / 100;

  // How much does current_value need to grow per remaining day?
  const deficit = targetValue - currentValue;
  const requiredDailyRate = daysRemaining > 0 && deficit > 0
    ? deficit / daysRemaining
    : 0;

  return {
    score:            Math.round(score * 10_000) / 10_000,   // 4 decimal places
    status,
    timeElapsedPct,
    progressPct,
    daysRemaining,
    totalDays,
    daysElapsed,
    requiredDailyRate: Math.round(requiredDailyRate * 100) / 100,
  };
}

// =============================================================================
// Status derivation
// =============================================================================

/**
 * Derive ObjectiveStatus from a raw pacing score.
 *
 * @param score - Raw pacing score (calculatePacing output).
 * @returns 'On-Track' | 'At-Risk' | 'Critical'
 */
export function deriveStatus(score: number): ObjectiveStatus {
  if (score >= PACING_ON_TRACK_THRESHOLD) return 'On-Track';
  if (score >= PACING_AT_RISK_THRESHOLD)  return 'At-Risk';
  return 'Critical';
}

// =============================================================================
// Batch helpers — work with arrays of Objectives
// =============================================================================

/**
 * Attach pacing data to a single Objective row from the database.
 * Safe to call even if start_date / end_date are in the past or future.
 *
 * @param objective - Row from the `objectives` table.
 * @param asOf      - Override "today" (optional; defaults to system clock).
 */
export function enrichObjectiveWithPacing(
  objective: Objective,
  asOf?: string | Date,
): ObjectiveWithPacing {
  const pacing = calculatePacing({
    currentValue: objective.current_value,
    targetValue:  objective.target_value,
    startDate:    objective.start_date,
    endDate:      objective.end_date,
    asOf,
  });
  return { ...objective, pacing };
}

/**
 * Recompute statuses for an array of Objective rows and return only the rows
 * whose status changed, together with the previous/new status pair.
 *
 * Typical use: call this from a nightly cron or an API route, then write
 * the changes back to Supabase in a single `upsert`.
 *
 * @param objectives - Array of Objective rows (all active objectives).
 * @param asOf       - Override "today" (optional).
 * @returns Updated objectives (all) and a diff of status changes.
 *
 * @example
 * ```ts
 * const { updated, changes } = recomputeObjectiveStatuses(objectives);
 * if (changes.length > 0) {
 *   await supabase.from('objectives').upsert(
 *     updated.map(({ id, status }) => ({ id, status }))
 *   );
 *   await sendStrategicDriftAlerts(changes);
 * }
 * ```
 */
export function recomputeObjectiveStatuses(
  objectives: Objective[],
  asOf?: string | Date,
): {
  updated: ObjectiveWithPacing[];
  changes: StatusChange[];
} {
  const updated: ObjectiveWithPacing[] = [];
  const changes: StatusChange[]        = [];

  for (const obj of objectives) {
    const enriched = enrichObjectiveWithPacing(obj, asOf);
    updated.push(enriched);

    if (enriched.pacing.status !== obj.status) {
      changes.push({
        objectiveId:    obj.id,
        previousStatus: obj.status,
        newStatus:      enriched.pacing.status,
        pacingScore:    enriched.pacing.score,
      });
    }
  }

  return { updated, changes };
}

/**
 * Filter a list of objectives to those the Catalyst engine should surface —
 * i.e., objectives that are 'Critical' or 'At-Risk' and belong to a given
 * department, sorted by weight descending so the highest-priority items come first.
 *
 * @param objectives - All objectives (pre-enriched with pacing is fine too).
 * @param department - The current user's department.
 * @param asOf       - Override "today" (optional).
 */
export function getCriticalObjectivesForDepartment(
  objectives: Objective[],
  department: string,
  asOf?: string | Date,
): ObjectiveWithPacing[] {
  return objectives
    .filter(o => o.department === department)
    .map(o => enrichObjectiveWithPacing(o, asOf))
    .filter(o => o.pacing.status === 'Critical' || o.pacing.status === 'At-Risk')
    .sort((a, b) => {
      // Primary: most severe first (Critical before At-Risk)
      if (a.pacing.status !== b.pacing.status) {
        return a.pacing.status === 'Critical' ? -1 : 1;
      }
      // Secondary: heavier weight first
      return b.weight - a.weight;
    });
}

// =============================================================================
// Formatting helpers — for display in the UI
// =============================================================================

/**
 * Return a human-readable label that describes how far ahead or behind an
 * objective is relative to pace.
 *
 * @example
 *   formatPacingLabel(1.25)  // "25% ahead of pace"
 *   formatPacingLabel(0.85)  // "15% behind pace"
 *   formatPacingLabel(1.0)   // "Exactly on pace"
 */
export function formatPacingLabel(score: number): string {
  const delta = Math.abs((score - 1) * 100);
  const pct   = delta.toFixed(1);

  if (Math.abs(score - 1) < 0.001) return 'Exactly on pace';
  if (score > 1) return `${pct}% ahead of pace`;
  return `${pct}% behind pace`;
}

/**
 * Hex colour tokens for each status — matches the Command Center dark-mode palette.
 */
export const STATUS_COLORS: Record<ObjectiveStatus, string> = {
  'On-Track': '#22c55e',   // green-500
  'At-Risk':  '#f59e0b',   // amber-500
  'Critical': '#ef4444',   // red-500
};
