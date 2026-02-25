/**
 * Tests for the invitation utility (invitations.ts).
 * Pure functions and mocked-Supabase functions.
 */

import {
  buildSignupUrl,
  invitationErrorMessage,
  fetchInvitationByToken,
} from '../invitations';
import { invitationStatus } from '@/types/focusline';
import type { Invitation } from '@/types/focusline';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date();
const inOneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

const PENDING_INV: Invitation = {
  id: 'inv-1',
  email: 'alice@acme.com',
  invited_by: 'admin-uuid',
  title: 'Account Executive',
  job_description: 'Closes enterprise deals',
  department: 'Sales',
  role: 'member',
  token: 'a'.repeat(64),
  expires_at: inOneWeek.toISOString(),
  accepted_at: null,
  created_at: now.toISOString(),
};

const ACCEPTED_INV: Invitation = {
  ...PENDING_INV,
  accepted_at: now.toISOString(),
};

const EXPIRED_INV: Invitation = {
  ...PENDING_INV,
  expires_at: oneWeekAgo.toISOString(),
};

// ---------------------------------------------------------------------------
// invitationStatus (pure, exported from types)
// ---------------------------------------------------------------------------

describe('invitationStatus', () => {
  it('returns accepted when accepted_at is set', () => {
    expect(invitationStatus(ACCEPTED_INV)).toBe('accepted');
  });

  it('returns expired when expires_at is in the past and not accepted', () => {
    expect(invitationStatus(EXPIRED_INV)).toBe('expired');
  });

  it('returns pending when not accepted and not expired', () => {
    expect(invitationStatus(PENDING_INV)).toBe('pending');
  });

  it('accepted takes precedence over expired', () => {
    const acceptedAndExpired: Invitation = { ...EXPIRED_INV, accepted_at: now.toISOString() };
    expect(invitationStatus(acceptedAndExpired)).toBe('accepted');
  });
});

// ---------------------------------------------------------------------------
// buildSignupUrl (pure)
// ---------------------------------------------------------------------------

describe('buildSignupUrl', () => {
  it('includes the token and encoded email', () => {
    const url = buildSignupUrl('https://app.focusline.io', 'deadbeef', 'alice@acme.com');
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://app.focusline.io');
    expect(parsed.pathname).toBe('/signup');
    expect(parsed.searchParams.get('token')).toBe('deadbeef');
    expect(parsed.searchParams.get('email')).toBe('alice@acme.com');
  });

  it('works with localhost base URL', () => {
    const url = buildSignupUrl('http://localhost:3000', 'tok', 'test@test.com');
    expect(url).toContain('localhost:3000');
    expect(url).toContain('/signup');
  });
});

// ---------------------------------------------------------------------------
// invitationErrorMessage (pure)
// ---------------------------------------------------------------------------

describe('invitationErrorMessage', () => {
  it('returns a non-empty string for all reason codes', () => {
    const reasons = ['not_found', 'expired', 'already_accepted'] as const;
    for (const reason of reasons) {
      const msg = invitationErrorMessage(reason);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(10);
    }
  });

  it('returns a generic message for undefined reason', () => {
    const msg = invitationErrorMessage(undefined);
    expect(msg).toContain('unknown');
  });
});

// ---------------------------------------------------------------------------
// fetchInvitationByToken (mocked Supabase)
// ---------------------------------------------------------------------------

function mockSupabaseFor(invitation: Invitation | null, error: object | null = null) {
  return {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: invitation,
      error,
    }),
  } as unknown as Parameters<typeof fetchInvitationByToken>[0];
}

describe('fetchInvitationByToken', () => {
  it('returns valid=false for a short/malformed token', async () => {
    const supabase = mockSupabaseFor(null);
    const result = await fetchInvitationByToken(supabase, 'short');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('returns valid=false when supabase returns null', async () => {
    const supabase = mockSupabaseFor(null);
    const result = await fetchInvitationByToken(supabase, 'a'.repeat(64));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('returns valid=false and reason=already_accepted when invitation is accepted', async () => {
    const supabase = mockSupabaseFor(ACCEPTED_INV);
    const result = await fetchInvitationByToken(supabase, 'a'.repeat(64));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('already_accepted');
  });

  it('returns valid=false and reason=expired when invitation is expired', async () => {
    const supabase = mockSupabaseFor(EXPIRED_INV);
    const result = await fetchInvitationByToken(supabase, 'a'.repeat(64));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('returns valid=true with the invitation for a valid pending token', async () => {
    const supabase = mockSupabaseFor(PENDING_INV);
    const result = await fetchInvitationByToken(supabase, 'a'.repeat(64));
    expect(result.valid).toBe(true);
    expect(result.invitation).toEqual(PENDING_INV);
    expect(result.reason).toBeUndefined();
  });

  it('returns valid=false when supabase returns an error', async () => {
    const supabase = mockSupabaseFor(null, { message: 'DB error' });
    const result = await fetchInvitationByToken(supabase, 'a'.repeat(64));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_found');
  });
});
