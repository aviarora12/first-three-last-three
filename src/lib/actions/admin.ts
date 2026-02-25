'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createInvitation, revokeInvitation, buildSignupUrl } from '@/lib/invitations';
import { scheduleReminder } from '@/lib/reminders';
import type { Invitation, InvitationInput, ReminderFrequency } from '@/types/focusline';

// =============================================================================
// inviteUser
// Creates an invitation record and returns the signup URL.
// For MVP: the URL is displayed in the UI for the admin to share manually.
// TODO: send via email (Resend / SendGrid) in production.
// =============================================================================

export async function inviteUser(
  input: InvitationInput,
): Promise<{ invitation?: Invitation; signupUrl?: string; error?: string }> {
  const supabase = createClient();
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  try {
    const { invitation, signupUrl } = await createInvitation(supabase, input, appBaseUrl);
    revalidatePath('/admin');
    return { invitation, signupUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create invitation' };
  }
}

// =============================================================================
// revokeInvite
// =============================================================================

export async function revokeInvite(
  invitationId: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  try {
    await revokeInvitation(supabase, invitationId);
    revalidatePath('/admin');
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to revoke invitation' };
  }
}

// =============================================================================
// scheduleReminderForObjective
// =============================================================================

export async function scheduleReminderForObjective(
  objectiveId: string | null,
  recipientId: string,
  frequency: ReminderFrequency,
  channelOverride?: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  try {
    await scheduleReminder(supabase, {
      objectiveId,
      recipientId,
      frequency,
      channelOverride,
    });
    revalidatePath('/admin');
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to schedule reminder' };
  }
}
