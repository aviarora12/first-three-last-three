/**
 * Tests for the reminders utility.
 * buildReminderPayload is pure; dispatchReminders uses a mocked Supabase + sendFn.
 */

import {
  buildReminderPayload,
  dispatchReminders,
} from '../reminders';
import type { PacingReminderQueueEntry } from '@/types/focusline';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_ENTRY: PacingReminderQueueEntry = {
  reminder_id:      'rem-1',
  recipient_id:     'user-1',
  recipient_name:   'Alice Smith',
  slack_user_id:    'U12345',
  channel_override: null,
  frequency:        'weekly',
  last_sent_at:     null,
  next_due_at:      new Date().toISOString(),
  objective_id:     'obj-1',
  objective_title:  'Increase ARR',
  objective_status: 'Critical',
  current_value:    40,
  target_value:     100,
  start_date:       '2026-01-01',
  end_date:         '2026-12-31',
  period_type:      'annual',
  period_year:      2026,
  period_month:     null,
  weight:           8,
  pacing_score:     0.65,
};

const GLOBAL_ENTRY: PacingReminderQueueEntry = {
  ...BASE_ENTRY,
  reminder_id:      'rem-global',
  objective_id:     null,
  objective_title:  null,
  objective_status: null,
  current_value:    null,
  target_value:     null,
  pacing_score:     null,
};

const APP_BASE = 'https://app.focusline.io';

// ---------------------------------------------------------------------------
// buildReminderPayload
// ---------------------------------------------------------------------------

describe('buildReminderPayload — objective-specific', () => {
  const payload = buildReminderPayload(BASE_ENTRY, APP_BASE);

  it('populates recipientSlackId', () => {
    expect(payload.recipientSlackId).toBe('U12345');
  });

  it('includes the objective title in the text', () => {
    expect(payload.text).toContain('Increase ARR');
  });

  it('includes pacing status in the text', () => {
    expect(payload.text).toContain('Critical');
  });

  it('includes a Slack blocks array with at least one element', () => {
    expect(Array.isArray(payload.blocks)).toBe(true);
    expect(payload.blocks.length).toBeGreaterThan(0);
  });

  it('channelOverride is null when not set', () => {
    expect(payload.channelOverride).toBeNull();
  });
});

describe('buildReminderPayload — global (null objective)', () => {
  const payload = buildReminderPayload(GLOBAL_ENTRY, APP_BASE);

  it('produces text for a global reminder', () => {
    expect(payload.text).toContain('FocusLine');
  });

  it('does not mention a specific objective', () => {
    expect(payload.text).not.toContain('Increase ARR');
  });

  it('includes blocks', () => {
    expect(payload.blocks.length).toBeGreaterThan(0);
  });
});

describe('buildReminderPayload — channel override', () => {
  it('sets channelOverride from the entry', () => {
    const entry = { ...BASE_ENTRY, channel_override: '#revenue-ops' };
    const payload = buildReminderPayload(entry, APP_BASE);
    expect(payload.channelOverride).toBe('#revenue-ops');
  });
});

// ---------------------------------------------------------------------------
// dispatchReminders
// ---------------------------------------------------------------------------

function makeSupabaseMock(entries: PacingReminderQueueEntry[]) {
  return {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue({ data: entries, error: null }),
    rpc: jest.fn().mockResolvedValue({ data: { id: 'rem-1' }, error: null }),
  } as unknown as Parameters<typeof dispatchReminders>[0];
}

describe('dispatchReminders', () => {
  it('calls sendFn once per due reminder and returns sent=true', async () => {
    const supabase = makeSupabaseMock([BASE_ENTRY]);
    const sendFn   = jest.fn().mockResolvedValue(undefined);

    const results = await dispatchReminders(supabase, APP_BASE, sendFn);

    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].sent).toBe(true);
    expect(results[0].reminderId).toBe('rem-1');
  });

  it('returns sent=false and populates error when sendFn throws', async () => {
    const supabase = makeSupabaseMock([BASE_ENTRY]);
    const sendFn   = jest.fn().mockRejectedValue(new Error('Slack is down'));

    const results = await dispatchReminders(supabase, APP_BASE, sendFn);

    expect(results[0].sent).toBe(false);
    expect(results[0].error).toContain('Slack is down');
  });

  it('does NOT advance schedule when sendFn fails', async () => {
    const supabase = makeSupabaseMock([BASE_ENTRY]);
    const sendFn   = jest.fn().mockRejectedValue(new Error('fail'));

    await dispatchReminders(supabase, APP_BASE, sendFn);

    // advance_reminder_schedule RPC should NOT have been called
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('returns empty array when no reminders are due', async () => {
    const supabase = makeSupabaseMock([]);
    const sendFn   = jest.fn();

    const results = await dispatchReminders(supabase, APP_BASE, sendFn);

    expect(results).toHaveLength(0);
    expect(sendFn).not.toHaveBeenCalled();
  });

  it('processes multiple due reminders independently', async () => {
    const entry2: PacingReminderQueueEntry = { ...BASE_ENTRY, reminder_id: 'rem-2' };
    const supabase = makeSupabaseMock([BASE_ENTRY, entry2]);
    const sendFn   = jest.fn().mockResolvedValue(undefined);

    const results = await dispatchReminders(supabase, APP_BASE, sendFn);

    expect(results).toHaveLength(2);
    expect(results.every(r => r.sent)).toBe(true);
    expect(sendFn).toHaveBeenCalledTimes(2);
  });
});
