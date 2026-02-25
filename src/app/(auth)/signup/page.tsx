'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchInvitationByToken, acceptInvitation, invitationErrorMessage } from '@/lib/invitations';
import type { Invitation } from '@/types/focusline';

export default function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token  = params.get('token') ?? '';
  const prefillEmail = decodeURIComponent(params.get('email') ?? '');

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [validating, setValidating] = useState(true);

  const [password, setPassword]     = useState('');
  const [fullName, setFullName]     = useState('');
  const [error, setError]           = useState<string | null>(null);
  const [pending, startTransition]  = useTransition();

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenError('No invitation token found. Please use the link from your invite email.');
      setValidating(false);
      return;
    }

    const supabase = createClient();
    fetchInvitationByToken(supabase, token).then(result => {
      if (!result.valid || !result.invitation) {
        setTokenError(invitationErrorMessage(result.reason));
      } else {
        setInvitation(result.invitation);
      }
      setValidating(false);
    });
  }, [token]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const email    = invitation?.email ?? prefillEmail;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });

      if (signUpError) { setError(signUpError.message); return; }

      // Belt-and-suspenders: apply invitation data to profile
      if (data.user && token) {
        try {
          await acceptInvitation(supabase, token, data.user.id);
        } catch {
          // Non-fatal: handle_new_user() trigger already did this server-side
        }
      }

      router.push('/dashboard');
      router.refresh();
    });
  }

  if (validating) {
    return (
      <div className="card p-6 text-center text-sm text-zinc-400">
        Validating your invitation…
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="card p-6 space-y-4">
        <div className="rounded-md bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-400">
          {tokenError}
        </div>
        <p className="text-xs text-zinc-500 text-center">
          Already have an account?{' '}
          <a href="/login" className="text-indigo-400 hover:underline">Sign in</a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="card p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Create your account</h1>
          {invitation && (
            <p className="mt-1 text-sm text-zinc-400">
              Invited as <span className="text-indigo-400">{invitation.title ?? invitation.role}</span>
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Email
          </label>
          <input
            type="email"
            className="input-base opacity-60 cursor-not-allowed"
            value={invitation?.email ?? prefillEmail}
            readOnly
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Full Name
          </label>
          <input
            type="text"
            className="input-base"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Password
          </label>
          <input
            type="password"
            className="input-base"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="text-xs text-zinc-600">At least 8 characters</p>
        </div>

        {invitation && (
          <div className="rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-400 space-y-0.5">
            {invitation.title && <p>Title: <span className="text-zinc-300">{invitation.title}</span></p>}
            {invitation.department && <p>Department: <span className="text-zinc-300">{invitation.department}</span></p>}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-2 px-4 rounded-md bg-indigo-600 hover:bg-indigo-500
                     text-sm font-semibold text-white transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </div>
    </form>
  );
}
