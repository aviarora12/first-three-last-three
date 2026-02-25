/**
 * FocusLine — Slack Notification Utility
 *
 * Sends messages via Slack's Web API (chat.postMessage).
 * Used for:
 *   - Blocker alerts (immediate, DM to blocking user)
 *   - Daily F3/L3 summaries (to a public channel)
 *   - Strategic Drift alerts (to manager channel when objective hits Critical)
 *   - Pacing reminder payloads (dispatched by reminders.ts)
 */

export interface SlackMessage {
  /** Slack channel ID or user ID for DMs. */
  channel: string;
  text: string;
  blocks?: unknown[];
}

export interface SlackBlockerAlertPayload {
  blockerUserSlackId: string;
  taskDescription: string;
  taskOwnerName: string;
  resolutionEta: string | null;
  taskUrl: string;
}

export interface SlackDriftAlertPayload {
  managerChannelId: string;
  objectiveTitle: string;
  previousStatus: string;
  newStatus: string;
  pacingScore: number;
  objectiveUrl: string;
}

export interface SlackDailySummaryPayload {
  channelId: string;
  userName: string;
  date: string;
  f3Tasks: string[];
  l3Tasks: string[];
  completedCount: number;
  incompleteCount: number;
}

/**
 * Low-level send function. All other helpers compose into this.
 */
async function sendMessage(message: SlackMessage): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set');

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    throw new Error(`Slack API HTTP error: ${res.status}`);
  }

  const data = await res.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
}

/**
 * Blocker Alert — sent immediately when a blocker is created.
 * DMs the blocking user so they know they're on someone's critical path.
 */
export async function sendBlockerAlert(payload: SlackBlockerAlertPayload): Promise<void> {
  const eta = payload.resolutionEta
    ? `ETA: ${new Date(payload.resolutionEta).toLocaleDateString()}`
    : 'No ETA set';

  await sendMessage({
    channel: payload.blockerUserSlackId,
    text: `🚧 You're blocking ${payload.taskOwnerName} — action needed`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🚧 Blocker Alert', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${payload.taskOwnerName}* is waiting on you to unblock:\n> ${payload.taskDescription}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*${eta}*` },
          { type: 'mrkdwn', text: `<${payload.taskUrl}|View Task>` },
        ],
      },
    ],
  });
}

/**
 * Strategic Drift Alert — sent to manager channel when an objective
 * transitions to a worse status (e.g. At-Risk → Critical).
 */
export async function sendDriftAlert(payload: SlackDriftAlertPayload): Promise<void> {
  const emoji = payload.newStatus === 'Critical' ? '🔴' : '🟡';

  await sendMessage({
    channel: payload.managerChannelId,
    text: `${emoji} Strategic Drift: "${payload.objectiveTitle}" moved to ${payload.newStatus}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Strategic Drift Detected`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Objective*\n${payload.objectiveTitle}` },
          {
            type: 'mrkdwn',
            text: `*Status Change*\n${payload.previousStatus} → ${payload.newStatus}`,
          },
          {
            type: 'mrkdwn',
            text: `*Pacing Score*\n${(payload.pacingScore * 100).toFixed(1)}% of target pace`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            style: 'danger',
            text: { type: 'plain_text', text: 'Review Objective', emoji: true },
            url: payload.objectiveUrl,
          },
        ],
      },
    ],
  });
}

/**
 * Daily Summary — sent to public channel at end of day with F3/L3 recap.
 */
export async function sendDailySummary(payload: SlackDailySummaryPayload): Promise<void> {
  const f3List = payload.f3Tasks.map(t => `• ${t}`).join('\n') || '_None set_';
  const l3List = payload.l3Tasks.map(t => `• ${t}`).join('\n') || '_Not submitted yet_';

  await sendMessage({
    channel: payload.channelId,
    text: `📋 ${payload.userName}'s Daily Summary — ${payload.date}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📋 ${payload.userName} — ${payload.date}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*First Three (Planned)*\n${f3List}` },
          { type: 'mrkdwn', text: `*Last Three (Completed)*\n${l3List}` },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `✅ ${payload.completedCount} complete · ❌ ${payload.incompleteCount} incomplete`,
          },
        ],
      },
    ],
  });
}
