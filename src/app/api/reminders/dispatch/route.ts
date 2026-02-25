import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchReminders, type ReminderPayload } from '@/lib/reminders';

/**
 * POST /api/reminders/dispatch
 *
 * Called by a daily cron job (e.g. 08:00 UTC).
 * Fetches all due pacing reminders and sends Slack notifications.
 *
 * Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  /** Slack Incoming Webhook sender */
  async function sendSlack(payload: ReminderPayload): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      // Gracefully no-op in dev when webhook is not configured
      console.log('[reminders] SLACK_WEBHOOK_URL not set — skipping:', payload.text);
      return;
    }

    const target = payload.channelOverride ?? payload.recipientSlackId;
    const body = target
      ? { channel: target, text: payload.text, blocks: payload.blocks }
      : { text: payload.text, blocks: payload.blocks };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Slack webhook returned ${res.status}`);
    }
  }

  const results = await dispatchReminders(supabase, appBaseUrl, sendSlack);

  const sent   = results.filter(r => r.sent).length;
  const failed = results.filter(r => !r.sent).length;

  console.log(`[reminders] dispatched ${sent} reminder(s), ${failed} failed`);

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    results,
    timestamp: new Date().toISOString(),
  });
}
