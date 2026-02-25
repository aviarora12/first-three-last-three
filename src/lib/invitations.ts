/**
 * FocusLine — Invitation Utility
 *
 * Admin workflow for inviting new users via email + password auth.
 * No OAuth providers are used — Supabase email/password only.
 *
 * Server-side functions (require service-role key or RLS admin session):
 *   createInvitation()     — admin creates an invite; returns token URL
 *   listInvitations()      — admin lists all invitations with statuses
 *   revokeInvitation()     — admin cancels a pending invite
 *
 * Client-side / Edge functions (called from the signup page):
 *   fetchInvitationByToken() — validate token on the signup page before showing form
 *   acceptInvitation()       — called after Supabase creates the auth.users row
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  type Invitation,
  type InvitationInput,
  type InvitationStatus,
  invitationStatus,
} from '@/types/focusline';

// =============================================================================
// Types
// =============================================================================

export interface CreateInvitationResult {
  invitation: Invitation;
  /** Full signup URL to email to the invitee. */
  signupUrl: string;
}

export interface InvitationValidation {
  valid: boolean;
  invitation: Invitation | null;
  /** Present when valid = false. */
  reason?: 'not_found' | 'expired' | 'already_accepted';
}

// =============================================================================
// createInvitation
//
// Called from the admin UI (/admin/invite).
// Uses the Supabase RPC `create_invitation` which enforces is_admin() server-side.
// =============================================================================

export async function createInvitation(
  supabase: SupabaseClient,
  input: InvitationInput,
  appBaseUrl: string,
): Promise<CreateInvitationResult> {
  const { data, error } = await supabase.rpc('create_invitation', {
    p_email:           input.email.toLowerCase().trim(),
    p_title:           input.title,
    p_job_description: input.job_description,
    p_department:      input.department,
    p_role:            input.role,
  });

  if (error) throw new Error(`Failed to create invitation: ${error.message}`);

  const invitation = data as Invitation;
  const signupUrl  = buildSignupUrl(appBaseUrl, invitation.token, invitation.email);

  return { invitation, signupUrl };
}

// =============================================================================
// listInvitations
//
// Returns all invitations with computed status (pending / accepted / expired).
// Admin-only via RLS.
// =============================================================================

export async function listInvitations(
  supabase: SupabaseClient,
): Promise<Array<Invitation & { computed_status: InvitationStatus }>> {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list invitations: ${error.message}`);

  return (data as Invitation[]).map(inv => ({
    ...inv,
    computed_status: invitationStatus(inv),
  }));
}

// =============================================================================
// revokeInvitation
//
// Soft-cancels a pending invitation by setting expires_at to now.
// The invitee's signup link will immediately return 'expired'.
// Admin-only via RLS.
// =============================================================================

export async function revokeInvitation(
  supabase: SupabaseClient,
  invitationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('invitations')
    .update({ expires_at: new Date().toISOString() })
    .eq('id', invitationId)
    .is('accepted_at', null);   // don't touch already-accepted rows

  if (error) throw new Error(`Failed to revoke invitation: ${error.message}`);
}

// =============================================================================
// fetchInvitationByToken
//
// Called on the /signup?token=<token> page to pre-populate the form and
// show a friendly error if the token is invalid or expired.
// =============================================================================

export async function fetchInvitationByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<InvitationValidation> {
  if (!token || token.length !== 64) {
    return { valid: false, invitation: null, reason: 'not_found' };
  }

  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, invitation: null, reason: 'not_found' };
  }

  const inv = data as Invitation;

  if (inv.accepted_at) {
    return { valid: false, invitation: inv, reason: 'already_accepted' };
  }

  if (new Date(inv.expires_at) < new Date()) {
    return { valid: false, invitation: inv, reason: 'expired' };
  }

  return { valid: true, invitation: inv };
}

// =============================================================================
// acceptInvitation
//
// Called in the onAuthStateChange handler immediately after the user's
// Supabase account is created (signup confirmation callback).
//
// Note: handle_new_user() in the DB already stamps accepted_at when the
// auth row is created. This function is a belt-and-suspenders client call
// for cases where the trigger finds the invitation but needs a second
// pass (e.g., delayed email confirmation flows).
// =============================================================================

export async function acceptInvitation(
  supabase: SupabaseClient,
  token: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc('accept_invitation', {
    p_token:   token,
    p_user_id: userId,
  });

  if (error) throw new Error(`Failed to accept invitation: ${error.message}`);
}

// =============================================================================
// buildSignupUrl
//
// Constructs the invitation link to embed in the email.
// The signup page reads ?token= and ?email= from query params.
// =============================================================================

export function buildSignupUrl(
  baseUrl: string,
  token: string,
  email: string,
): string {
  const url = new URL('/signup', baseUrl);
  url.searchParams.set('token', token);
  url.searchParams.set('email', encodeURIComponent(email));
  return url.toString();
}

// =============================================================================
// invitationErrorMessage
//
// Maps validation reasons to user-facing strings for the signup page.
// =============================================================================

export function invitationErrorMessage(reason: InvitationValidation['reason']): string {
  switch (reason) {
    case 'not_found':
      return 'This invitation link is invalid. Please ask your admin to resend the invite.';
    case 'expired':
      return 'This invitation has expired (links are valid for 7 days). Please ask your admin to send a new invite.';
    case 'already_accepted':
      return 'This invitation has already been used. If you need to log in, use the sign-in page.';
    default:
      return 'An unknown error occurred with your invitation. Please contact support.';
  }
}
