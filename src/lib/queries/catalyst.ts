import type { SupabaseClient } from '@supabase/supabase-js';
import { getOpenBlockersForUser } from './log';
import { getCriticalByDepartment } from './objectives';
import type { Blocker, ObjectiveWithPacing, Profile } from '@/types/focusline';

export interface SuggestedTask {
  description: string;
  objectiveId: string | null;
  objectiveTitle: string | null;
  reason: string;
  /** Priority ordering: lower = more urgent */
  priority: number;
}

// =============================================================================
// getCatalystData
// Runs both Catalyst queries in parallel.
// =============================================================================

export async function getCatalystData(
  supabase: SupabaseClient,
  userId: string,
  department: string,
): Promise<{
  blockers: Array<Blocker & { task_description: string }>;
  criticalObjectives: ObjectiveWithPacing[];
}> {
  const [blockers, criticalObjectives] = await Promise.all([
    getOpenBlockersForUser(supabase, userId),
    getCriticalByDepartment(supabase, department),
  ]);

  return { blockers, criticalObjectives };
}

// =============================================================================
// buildSuggestedTasks
// Pure function — fully testable without Supabase.
//
// Priority logic:
//   1. Tasks to resolve open blockers (someone is waiting on this user)
//   2. Tasks addressing Critical objectives (sorted by weight desc)
//   3. Tasks for At-Risk objectives
//
// Returns up to 3 suggestions.
// =============================================================================

export function buildSuggestedTasks(
  blockers: Array<Blocker & { task_description: string }>,
  criticalObjectives: ObjectiveWithPacing[],
  profile: Pick<Profile, 'title' | 'job_description' | 'department'>,
): SuggestedTask[] {
  const suggestions: SuggestedTask[] = [];

  // Priority 1: Open blockers — the user is holding someone up
  for (const blocker of blockers.slice(0, 2)) {
    suggestions.push({
      description: `Unblock: ${blocker.task_description}`,
      objectiveId: null,
      objectiveTitle: null,
      reason: 'You have an open blocker — a teammate is waiting on your action.',
      priority: 1,
    });
    if (suggestions.length >= 3) break;
  }

  // Priority 2 & 3: Critical / At-Risk objectives
  for (const obj of criticalObjectives) {
    if (suggestions.length >= 3) break;

    const isCritical = obj.pacing.status === 'Critical';
    const roleHint   = profile.title ? ` (relevant to your role as ${profile.title})` : '';

    suggestions.push({
      description: `Drive progress on: ${obj.title}${roleHint}`,
      objectiveId: obj.id,
      objectiveTitle: obj.title,
      reason: isCritical
        ? `"${obj.title}" is Critical — ${obj.pacing.score.toFixed(2)}x pacing score. Your focus here has the highest strategic impact.`
        : `"${obj.title}" is At-Risk and aligned to your department. Prevent it from becoming Critical.`,
      priority: isCritical ? 2 : 3,
    });
  }

  return suggestions.sort((a, b) => a.priority - b.priority).slice(0, 3);
}
