/**
 * Tests for buildSuggestedTasks — the pure Catalyst suggestion function.
 * No Supabase mocking needed: this function is fully side-effect-free.
 */

import { buildSuggestedTasks } from '../queries/catalyst';
import { enrichObjectiveWithPacing } from '../pacing';
import type { Blocker, Objective, Profile } from '@/types/focusline';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROFILE: Pick<Profile, 'title' | 'job_description' | 'department'> = {
  title: 'Account Executive',
  job_description: 'Closes enterprise deals',
  department: 'Sales',
};

const makeObjective = (
  id: string,
  current: number,
  weight: number,
  status: Objective['status'] = 'Critical',
): ReturnType<typeof enrichObjectiveWithPacing> =>
  enrichObjectiveWithPacing({
    id,
    title: `Objective ${id}`,
    description: null,
    department: 'Sales',
    weight,
    target_value: 100,
    current_value: current,
    status,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    period_type: 'annual',
    period_year: 2026,
    period_month: null,
    owner_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }, '2026-12-01'); // late in the year → Critical for low current values

const makeBlocker = (id: string, taskDescription: string): Blocker & { task_description: string } => ({
  id,
  blocked_task_id: `task-${id}`,
  blocking_user_id: 'user-1',
  resolution_eta: null,
  resolved_at: null,
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  task_description: taskDescription,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSuggestedTasks', () => {
  it('returns an empty array when no blockers and no critical objectives', () => {
    const result = buildSuggestedTasks([], [], PROFILE);
    expect(result).toHaveLength(0);
  });

  it('returns at most 3 suggestions', () => {
    const blockers = [
      makeBlocker('b1', 'Review contract'),
      makeBlocker('b2', 'Approve budget'),
      makeBlocker('b3', 'Sign NDA'),
    ];
    const result = buildSuggestedTasks(blockers, [], PROFILE);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('prioritises blocker tasks first', () => {
    const blockers = [makeBlocker('b1', 'Review contract')];
    const objectives = [makeObjective('o1', 5, 8)];

    const result = buildSuggestedTasks(blockers, objectives, PROFILE);
    expect(result[0].priority).toBe(1); // blocker = priority 1
    expect(result[0].description).toContain('Review contract');
  });

  it('includes a task for a Critical objective', () => {
    const objectives = [makeObjective('o1', 5, 8, 'Critical')];
    const result = buildSuggestedTasks([], objectives, PROFILE);

    expect(result).toHaveLength(1);
    expect(result[0].objectiveId).toBe('o1');
    expect(result[0].reason).toContain('Critical');
  });

  it('sorts Critical objectives before At-Risk', () => {
    const objs = [
      makeObjective('at-risk', 40, 7, 'At-Risk'),
      makeObjective('critical', 5, 3, 'Critical'),
    ];
    const result = buildSuggestedTasks([], objs, PROFILE);

    // Critical should appear first regardless of weight
    const criticalIdx = result.findIndex(t => t.objectiveId === 'critical');
    const atRiskIdx   = result.findIndex(t => t.objectiveId === 'at-risk');
    if (criticalIdx !== -1 && atRiskIdx !== -1) {
      expect(criticalIdx).toBeLessThan(atRiskIdx);
    }
  });

  it('includes role hint in task description when profile has a title', () => {
    const result = buildSuggestedTasks([], [makeObjective('o1', 5, 8)], PROFILE);
    if (result.length > 0) {
      expect(result[0].description).toContain('Account Executive');
    }
  });

  it('skips the role hint when profile has no title', () => {
    const profileNoTitle = { ...PROFILE, title: null };
    const result = buildSuggestedTasks([], [makeObjective('o1', 5, 8)], profileNoTitle);
    if (result.length > 0) {
      expect(result[0].description).not.toContain('undefined');
    }
  });

  it('fills up to 3 from blockers + objectives combined', () => {
    const blockers = [makeBlocker('b1', 'Blocker task')];
    const objs = [
      makeObjective('o1', 5, 9),
      makeObjective('o2', 5, 7),
      makeObjective('o3', 5, 5),
    ];
    const result = buildSuggestedTasks(blockers, objs, PROFILE);
    expect(result).toHaveLength(3);
    expect(result[0].description).toContain('Blocker task');
  });
});
