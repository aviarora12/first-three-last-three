/**
 * FocusLine — Pacing Reminder Utility
 *
 * Manages the scheduling, dispatch, and advancement of pacing reminders —
 * the weekly (or more frequent) pings that prompt admins to update
 * current_value on their objectives.
 *
 * Architecture:
 *   • pacing_reminders table  — stores schedule config per (objective, recipient)
 *   • pacing_reminder_queue   — Postgres view: rows where next_due_at <= NOW()
 *   • advance_reminder_schedule() — PL/pgSQL: rolls next_due_at forward after send
 *
 * This module is called from:
 *   • An Edge Function (e.g., supabase/functions/dispatch-reminders/index.ts)
 *     scheduled by pg_cron to run daily at 08:00 in each admin's timezone.
 *   • The admin UI to create / edit / pause reminder schedules.
 *
 * No third-party scheduler dependency — Supabase pg_cron or a simple
 * daily cron on your server is sufficient.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type PacingReminder,
  type PacingReminderQueueEntry,
  type ReminderFrequency,
  REMINDER_FREQUENCY_LABELS,
} from '@/types/focusline';
import { formatPacingLabel, STATUS_COLORS } from './pacing';

// =============================================================================
// Types
// =============================================================================

export interface ScheduleReminderInput {
  objectiveId: string | null;   // NULL = catch-all reminder for any critical obj
  recipientId: string;
  frequency: ReminderFrequency;
  /** Slack channel ID (e.g. "#revenue-ops") or Teams webhook URL. */
  channelOverride?: string;
  /** When should the first reminder fire? Defaults to immediately. */
  startAt?: Date;
}

export interface ReminderDispatchResult {
  reminderId: string;
  recipientId: string;
  objectiveId: string | null;
  /** Whether the notification was successfully sent. */
  sent: boolean;
  error?: string;
}

/** Formatted message payload for Slack Block Kit or Teams Adaptive Card. */
export interface ReminderPayload {
  recipientSlackId: string | null;
  channelOverride: string | null;
  /** Plain text fallback (for Teams / email). */
  text: string;
  /** Slack Block Kit blocks. */
  blocks: SlackBlock[];
}

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

// =============================================================================
// scheduleReminder
//
// Creates or upserts a pacing_reminders row for a given (objective, recipient).
// The UNIQUE constraint ensures no duplicate schedules per pair.
// =============================================================================

export async function scheduleReminder(
  supabase: SupabaseClient,
  input: ScheduleReminderInput,
): Promise<PacingReminder> {
  const payload = {
    objective_id:     input.objectiveId,
    recipient_id:     input.recipientId,
    frequency:        input.frequency,
    channel_override: input.channelOverride ?? null,
    next_due_at:      (input.startAt ?? new Date()).toISOString(),
    is_active:        true,
  };

  const { data, error } = await supabase
    .from('pacing_reminders')
    .upsert(payload, {
      onConflict:        'recipient_id,objective_id',
      ignoreDuplicates:  false,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to schedule reminder: ${error.message}`);
  return data as PacingReminder;
}

// =============================================================================
// pauseReminder / resumeReminder
// =============================================================================

export async function pauseReminder(
  supabase: SupabaseClient,
  reminderId: string,
): Promise<void> {
  const { error } = await supabase
    .from('pacing_reminders')
    .update({ is_active: false })
    .eq('id', reminderId);

  if (error) throw new Error(`Failed to pause reminder: ${error.message}`);
}

export async function resumeReminder(
  supabase: SupabaseClient,
  reminderId: string,
): Promise<void> {
  const { error } = await supabase
    .from('pacing_reminders')
    .update({ is_active: true, next_due_at: new Date().toISOString() })
    .eq('id', reminderId);

  if (error) throw new Error(`Failed to resume reminder: ${error.message}`);
}

// =============================================================================
// updateReminderFrequency
//
// Admin UI: change how often a reminder fires (e.g., weekly → daily during
// a sprint to get an objective back on track).
// =============================================================================

export async function updateReminderFrequency(
  supabase: SupabaseClient,
  reminderId: string,
  frequency: ReminderFrequency,
): Promise<PacingReminder> {
  const { data, error } = await supabase
    .from('pacing_reminders')
    .update({ frequency })
    .eq('id', reminderId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update reminder frequency: ${error.message}`);
  return data as PacingReminder;
}

// =============================================================================
// fetchDueReminders
//
// Reads the pacing_reminder_queue view to get all reminders where
// next_due_at <= NOW().  Called by the dispatch Edge Function.
// =============================================================================

export async function fetchDueReminders(
  supabase: SupabaseClient,
): Promise<PacingReminderQueueEntry[]> {
  const { data, error } = await supabase
    .from('pacing_reminder_queue')
    .select('*');

  if (error) throw new Error(`Failed to fetch due reminders: ${error.message}`);
  return (data ?? []) as PacingReminderQueueEntry[];
}

// =============================================================================
// advanceReminderSchedule
//
// Calls the DB function that stamps last_sent_at and rolls next_due_at forward.
// Call this AFTER successfully dispatching a notification.
// =============================================================================

export async function advanceReminderSchedule(
  supabase: SupabaseClient,
  reminderId: string,
): Promise<PacingReminder> {
  const { data, error } = await supabase.rpc('advance_reminder_schedule', {
    p_reminder_id: reminderId,
  });

  if (error) throw new Error(`Failed to advance reminder schedule: ${error.message}`);
  return data as PacingReminder;
}

// =============================================================================
// buildReminderPayload
//
// Formats a Slack Block Kit message for a pacing reminder.
// The payload includes:
//   • Current pacing score with colour-coded status
//   • required daily rate to get back on track
//   • A deep link to the objective's detail page in FocusLine
//   • A CTA button to update current_value (links to the admin update form)
// =============================================================================

export function buildReminderPayload(
  entry: PacingReminderQueueEntry,
  appBaseUrl: string,
): ReminderPayload {
  const isGlobal = !entry.objective_id;

  // ── Plain-text fallback ──────────────────────────────────────────────────
  const text = isGlobal
    ? buildGlobalReminderText(entry)
    : buildObjectiveReminderText(entry, appBaseUrl);

  // ── Slack Block Kit ──────────────────────────────────────────────────────
  const blocks: SlackBlock[] = isGlobal
    ? buildGlobalBlocks(entry, appBaseUrl)
    : buildObjectiveBlocks(entry, appBaseUrl);

  return {
    recipientSlackId: entry.slack_user_id,
    channelOverride:  entry.channel_override,
    text,
    blocks,
  };
}

// =============================================================================
// dispatchReminders
//
// Orchestrates the full dispatch loop:
//   1. Fetch all due reminders from the queue view
//   2. For each: build payload, call the caller-supplied send function
//   3. Advance schedule on success; log error on failure
//
// The caller provides `sendFn` so this module stays decoupled from
// the Slack / Teams SDK (testable with a mock).
//
// Usage in Edge Function:
// ```ts
// import { WebClient } from '@slack/web-api';
// const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
// await dispatchReminders(supabase, APP_BASE_URL, async (payload) => {
//   const channel = payload.channelOverride ?? payload.recipientSlackId;
//   await slack.chat.postMessage({ channel, text: payload.text, blocks: payload.blocks });
// });
// ```
// =============================================================================

export async function dispatchReminders(
  supabase: SupabaseClient,
  appBaseUrl: string,
  sendFn: (payload: ReminderPayload) => Promise<void>,
): Promise<ReminderDispatchResult[]> {
  const due     = await fetchDueReminders(supabase);
  const results: ReminderDispatchResult[] = [];

  for (const entry of due) {
    const result: ReminderDispatchResult = {
      reminderId:  entry.reminder_id,
      recipientId: entry.recipient_id,
      objectiveId: entry.objective_id,
      sent:        false,
    };

    try {
      const payload = buildReminderPayload(entry, appBaseUrl);
      await sendFn(payload);
      await advanceReminderSchedule(supabase, entry.reminder_id);
      result.sent = true;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }

    results.push(result);
  }

  return results;
}

// =============================================================================
// Helpers
// =============================================================================

function buildObjectiveReminderText(
  entry: PacingReminderQueueEntry,
  appBaseUrl: string,
): string {
  const score      = entry.pacing_score;
  const paceLabel  = score !== null ? formatPacingLabel(score) : 'unknown';
  const periodDesc = formatPeriodDesc(entry);
  const updateUrl  = buildUpdateUrl(appBaseUrl, entry.objective_id!);

  return (
    `📊 Pacing update needed: "${entry.objective_title}" [${entry.objective_status}]\n` +
    `Period: ${periodDesc} | Progress: ${paceLabel}\n` +
    `Current: ${entry.current_value} / ${entry.target_value}\n` +
    `Update current value → ${updateUrl}`
  );
}

function buildGlobalReminderText(entry: PacingReminderQueueEntry): string {
  return (
    `📋 FocusLine weekly check-in: please review and update pacing values for all At-Risk and Critical objectives.\n` +
    `Frequency: ${REMINDER_FREQUENCY_LABELS[entry.frequency]}`
  );
}

function buildObjectiveBlocks(
  entry: PacingReminderQueueEntry,
  appBaseUrl: string,
): SlackBlock[] {
  const score       = entry.pacing_score;
  const status      = entry.objective_status ?? 'On-Track';
  const statusColor = STATUS_COLORS[status];
  const paceLabel   = score !== null ? formatPacingLabel(score) : 'Calculating…';
  const periodDesc  = formatPeriodDesc(entry);
  const updateUrl   = buildUpdateUrl(appBaseUrl, entry.objective_id!);
  const detailUrl   = `${appBaseUrl}/objectives/${entry.objective_id}`;

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📊 Pacing Update Needed', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Objective*\n${entry.objective_title}` },
        {
          type: 'mrkdwn',
          text: `*Status*\n${statusEmoji(status)} ${status}`,
        },
        { type: 'mrkdwn', text: `*Period*\n${periodDesc}` },
        {
          type: 'mrkdwn',
          text: `*Pacing*\n${paceLabel} (score: ${score !== null ? score.toFixed(3) : '—'})`,
        },
        {
          type: 'mrkdwn',
          text: `*Progress*\n${entry.current_value} / ${entry.target_value}`,
        },
        {
          type: 'mrkdwn',
          text: `*Frequency*\n${REMINDER_FREQUENCY_LABELS[entry.frequency]}`,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type:      'button',
          style:     'primary',
          text:      { type: 'plain_text', text: '✏️ Update Current Value', emoji: true },
          url:       updateUrl,
          action_id: 'update_pacing',
        },
        {
          type:      'button',
          text:      { type: 'plain_text', text: 'View Objective', emoji: true },
          url:       detailUrl,
          action_id: 'view_objective',
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_FocusLine · Pacing colour: <${detailUrl}|${statusColor}>_`,
        },
      ],
    },
  ];
}

function buildGlobalBlocks(
  entry: PacingReminderQueueEntry,
  appBaseUrl: string,
): SlackBlock[] {
  const dashboardUrl = `${appBaseUrl}/admin/objectives`;
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📋 Weekly Pacing Review',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          'Please review all *At-Risk* and *Critical* objectives and update their `current_value` so the Catalyst engine stays accurate.',
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type:      'button',
          style:     'primary',
          text:      { type: 'plain_text', text: '🎯 Review Objectives', emoji: true },
          url:       dashboardUrl,
          action_id: 'review_objectives',
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Frequency: ${REMINDER_FREQUENCY_LABELS[entry.frequency]} · FocusLine_`,
        },
      ],
    },
  ];
}

function formatPeriodDesc(entry: PacingReminderQueueEntry): string {
  if (!entry.period_type) return entry.start_date ?? '';
  switch (entry.period_type) {
    case 'monthly': {
      const monthName = entry.period_month
        ? new Date(2000, entry.period_month - 1).toLocaleString('en-US', { month: 'long' })
        : '';
      return `${monthName} ${entry.period_year}`;
    }
    case 'annual':
      return `FY${entry.period_year}`;
    default:
      return `${entry.start_date} → ${entry.end_date}`;
  }
}

function buildUpdateUrl(baseUrl: string, objectiveId: string): string {
  return `${baseUrl}/admin/objectives/${objectiveId}/update-pacing`;
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'On-Track': return '🟢';
    case 'At-Risk':  return '🟡';
    case 'Critical': return '🔴';
    default:         return '⚪';
  }
}
