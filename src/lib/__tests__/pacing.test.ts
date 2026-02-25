/**
 * Unit tests for the pacing logic utility.
 * Run with: npx jest src/lib/__tests__/pacing.test.ts
 */

import {
  calculatePacing,
  deriveStatus,
  enrichObjectiveWithPacing,
  recomputeObjectiveStatuses,
  getCriticalObjectivesForDepartment,
  formatPacingLabel,
  PACING_ON_TRACK_THRESHOLD,
  PACING_AT_RISK_THRESHOLD,
} from '../pacing';
import type { Objective } from '@/types/focusline';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_OBJECTIVE: Objective = {
  id: 'obj-1',
  title: 'New Revenue',
  description: null,
  department: 'Sales',
  weight: 8,
  target_value: 100,
  current_value: 0,
  status: 'On-Track',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  // Period fields added in migration 002
  period_type: 'annual',
  period_year: 2026,
  period_month: null,
  owner_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// deriveStatus
// ---------------------------------------------------------------------------

describe('deriveStatus', () => {
  it('returns On-Track when score >= 1.0', () => {
    expect(deriveStatus(1.0)).toBe('On-Track');
    expect(deriveStatus(1.5)).toBe('On-Track');
    expect(deriveStatus(PACING_ON_TRACK_THRESHOLD)).toBe('On-Track');
  });

  it('returns At-Risk when score is between 0.8 and 1.0 (exclusive)', () => {
    expect(deriveStatus(0.8)).toBe('At-Risk');
    expect(deriveStatus(0.9)).toBe('At-Risk');
    expect(deriveStatus(0.999)).toBe('At-Risk');
    expect(deriveStatus(PACING_AT_RISK_THRESHOLD)).toBe('At-Risk');
  });

  it('returns Critical when score < 0.8', () => {
    expect(deriveStatus(0.79)).toBe('Critical');
    expect(deriveStatus(0.0)).toBe('Critical');
    expect(deriveStatus(0.5)).toBe('Critical');
  });
});

// ---------------------------------------------------------------------------
// calculatePacing — On-Track scenario
// ---------------------------------------------------------------------------

describe('calculatePacing — On-Track', () => {
  it('returns score >= 1.0 when progress matches elapsed time', () => {
    // 50% through a 100-day window, 50% of target achieved → score = 1.0
    const result = calculatePacing({
      currentValue: 50,
      targetValue: 100,
      startDate: '2026-01-01',
      endDate: '2026-04-10',   // 99 days total
      asOf: '2026-02-09',      // ~40 days in, ~40% elapsed
    });
    expect(result.status).toBe('On-Track');
    expect(result.score).toBeGreaterThanOrEqual(1.0);
  });

  it('returns score > 1.0 when progress exceeds elapsed proportion', () => {
    // 10% through time, 20% of target → ahead of pace
    const result = calculatePacing({
      currentValue: 20,
      targetValue: 100,
      startDate: '2026-01-01',
      endDate: '2026-04-10',
      asOf: '2026-01-11',  // 10 days in out of 99
    });
    expect(result.score).toBeGreaterThan(1.0);
    expect(result.status).toBe('On-Track');
  });
});

// ---------------------------------------------------------------------------
// calculatePacing — At-Risk scenario
// ---------------------------------------------------------------------------

describe('calculatePacing — At-Risk', () => {
  it('returns score between 0.8 and 1.0 for moderate lag', () => {
    // 50% through time, 42% of target — slightly behind
    const result = calculatePacing({
      currentValue: 42,
      targetValue: 100,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      asOf: '2026-07-02',  // ~182 days of 364 → ~50%
    });
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.score).toBeLessThan(1.0);
    expect(result.status).toBe('At-Risk');
  });
});

// ---------------------------------------------------------------------------
// calculatePacing — Critical scenario
// ---------------------------------------------------------------------------

describe('calculatePacing — Critical', () => {
  it('returns score < 0.8 when significantly behind', () => {
    // 60% through the year but only 40% done → score = 0.667
    const result = calculatePacing({
      currentValue: 40,
      targetValue: 100,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      asOf: '2026-08-02',  // ~213 days of 364 → ~58.5%
    });
    expect(result.score).toBeLessThan(0.8);
    expect(result.status).toBe('Critical');
  });
});

// ---------------------------------------------------------------------------
// calculatePacing — edge cases
// ---------------------------------------------------------------------------

describe('calculatePacing — edge cases', () => {
  it('does not divide by zero on day 1 (daysElapsed clamped to 1)', () => {
    expect(() =>
      calculatePacing({
        currentValue: 0,
        targetValue: 100,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        asOf: '2026-01-01',  // same as start_date
      })
    ).not.toThrow();
  });

  it('throws on targetValue <= 0', () => {
    expect(() =>
      calculatePacing({ currentValue: 5, targetValue: 0, startDate: '2026-01-01', endDate: '2026-12-31' })
    ).toThrow(RangeError);
  });

  it('throws on currentValue < 0', () => {
    expect(() =>
      calculatePacing({ currentValue: -1, targetValue: 100, startDate: '2026-01-01', endDate: '2026-12-31' })
    ).toThrow(RangeError);
  });

  it('throws when endDate is not after startDate', () => {
    expect(() =>
      calculatePacing({ currentValue: 50, targetValue: 100, startDate: '2026-06-01', endDate: '2026-01-01' })
    ).toThrow(RangeError);
  });

  it('computes requiredDailyRate correctly', () => {
    const result = calculatePacing({
      currentValue: 50,
      targetValue: 100,
      startDate: '2026-01-01',
      endDate: '2026-01-11',  // 10-day window
      asOf: '2026-01-06',     // 5 days in, 5 remaining
    });
    // Need 50 more units over 5 days = 10/day
    expect(result.requiredDailyRate).toBeCloseTo(10, 1);
  });

  it('sets requiredDailyRate to 0 when already at or above target', () => {
    const result = calculatePacing({
      currentValue: 100,
      targetValue: 100,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      asOf: '2026-06-01',
    });
    expect(result.requiredDailyRate).toBe(0);
  });

  it('accepts Date objects as well as strings', () => {
    const result = calculatePacing({
      currentValue: 50,
      targetValue: 100,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      asOf: new Date('2026-07-02'),
    });
    expect(typeof result.score).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// enrichObjectiveWithPacing
// ---------------------------------------------------------------------------

describe('enrichObjectiveWithPacing', () => {
  it('attaches a pacing object to the objective', () => {
    const obj: Objective = {
      ...BASE_OBJECTIVE,
      current_value: 60,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    };
    const result = enrichObjectiveWithPacing(obj, '2026-07-01');
    expect(result.pacing).toBeDefined();
    expect(result.pacing.score).toBeGreaterThan(0);
    expect(['On-Track', 'At-Risk', 'Critical']).toContain(result.pacing.status);
  });
});

// ---------------------------------------------------------------------------
// recomputeObjectiveStatuses
// ---------------------------------------------------------------------------

describe('recomputeObjectiveStatuses', () => {
  const makeObj = (id: string, current: number, status: Objective['status']): Objective => ({
    ...BASE_OBJECTIVE,
    id,
    current_value: current,
    status,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
  });

  it('detects status changes', () => {
    const objectives = [
      makeObj('a', 10, 'On-Track'),  // 10% progress; if > ~50% time elapsed → Critical
      makeObj('b', 80, 'Critical'),  // 80% progress; if < ~80% time elapsed → On-Track / At-Risk
    ];
    // Freeze at ~60% of the year
    const { changes, updated } = recomputeObjectiveStatuses(objectives, '2026-08-01');

    expect(updated).toHaveLength(2);
    // At least one status should have changed from the fixture values
    const hasChanges = changes.length > 0;
    expect(hasChanges).toBe(true);
  });

  it('returns no changes when statuses are already correct', () => {
    // Objective is already 'Critical' and pacing confirms it
    const objectives = [makeObj('c', 5, 'Critical')];
    const { changes } = recomputeObjectiveStatuses(objectives, '2026-12-30');
    expect(changes.find(c => c.newStatus !== c.previousStatus && c.objectiveId === 'c')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getCriticalObjectivesForDepartment
// ---------------------------------------------------------------------------

describe('getCriticalObjectivesForDepartment', () => {
  const sales = (id: string, current: number, weight: number): Objective => ({
    ...BASE_OBJECTIVE,
    id,
    current_value: current,
    weight,
    department: 'Sales',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
  });
  const eng = (id: string, current: number): Objective => ({
    ...BASE_OBJECTIVE,
    id,
    current_value: current,
    department: 'Engineering',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
  });

  it('only returns objectives for the given department', () => {
    const objs = [sales('s1', 5, 5), eng('e1', 5)];
    const result = getCriticalObjectivesForDepartment(objs, 'Sales', '2026-12-01');
    expect(result.every(o => o.department === 'Sales')).toBe(true);
  });

  it('excludes On-Track objectives', () => {
    const objs = [
      sales('s-good', 99, 5),    // basically done → On-Track
      sales('s-bad',  5,  8),    // far behind → Critical
    ];
    const result = getCriticalObjectivesForDepartment(objs, 'Sales', '2026-12-01');
    expect(result.find(o => o.id === 's-good')).toBeUndefined();
    expect(result.find(o => o.id === 's-bad')).toBeDefined();
  });

  it('sorts Critical before At-Risk, then by weight descending', () => {
    const objs = [
      sales('low-weight-critical', 5, 3),
      sales('high-weight-critical', 5, 9),
      sales('at-risk', 42, 7),
    ];
    const result = getCriticalObjectivesForDepartment(objs, 'Sales', '2026-12-01');
    // All three should be non-On-Track at this late date
    if (result.length >= 2) {
      for (let i = 0; i < result.length - 1; i++) {
        const a = result[i];
        const b = result[i + 1];
        if (a.pacing.status === b.pacing.status) {
          expect(a.weight).toBeGreaterThanOrEqual(b.weight);
        } else {
          expect(a.pacing.status).toBe('Critical');
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// formatPacingLabel
// ---------------------------------------------------------------------------

describe('formatPacingLabel', () => {
  it('returns "Exactly on pace" for score ≈ 1.0', () => {
    expect(formatPacingLabel(1.0)).toBe('Exactly on pace');
  });

  it('formats ahead-of-pace correctly', () => {
    expect(formatPacingLabel(1.25)).toBe('25.0% ahead of pace');
  });

  it('formats behind-pace correctly', () => {
    expect(formatPacingLabel(0.85)).toBe('15.0% behind pace');
  });
});
