'use client';

import { useState, useTransition } from 'react';
import { inviteUser } from '@/lib/actions/admin';
import { Button } from '@/components/ui/Button';
import type { UserRole } from '@/types/focusline';

export function InviteForm() {
  const [email, setEmail]     = useState('');
  const [title, setTitle]     = useState('');
  const [jobDesc, setJobDesc] = useState('');
  const [dept, setDept]       = useState('');
  const [role, setRole]       = useState<UserRole>('member');
  const [error, setError]     = useState<string | null>(null);
  const [signupUrl, setSignupUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSignupUrl(null);

    startTransition(async () => {
      const result = await inviteUser({ email, title, job_description: jobDesc, department: dept, role });
      if (result.error) { setError(result.error); return; }
      setSignupUrl(result.signupUrl ?? null);
      setEmail('');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4">
      {error && (
        <div className="rounded bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {signupUrl && (
        <div className="rounded bg-green-950 border border-green-800 px-3 py-3 space-y-2">
          <p className="text-xs text-green-400 font-semibold">✓ Invitation created. Share this link:</p>
          <input
            readOnly
            value={signupUrl}
            className="input-base text-xs font-mono cursor-text"
            onClick={e => (e.target as HTMLInputElement).select()}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        <Field label="Email" required>
          <input type="email" className="input-base" value={email} onChange={e => setEmail(e.target.value)} required />
        </Field>
        <Field label="Job Title">
          <input type="text" className="input-base" placeholder="Account Executive" value={title} onChange={e => setTitle(e.target.value)} />
        </Field>
        <Field label="Job Description">
          <textarea
            className="input-base resize-none"
            rows={3}
            placeholder="Responsible for closing new business in the enterprise segment…"
            value={jobDesc}
            onChange={e => setJobDesc(e.target.value)}
          />
        </Field>
        <Field label="Department">
          <input type="text" className="input-base" placeholder="Sales" value={dept} onChange={e => setDept(e.target.value)} />
        </Field>
        <Field label="Role">
          <div className="flex gap-4">
            {(['member', 'admin'] as UserRole[]).map(r => (
              <label key={r} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="accent-indigo-500" />
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </label>
            ))}
          </div>
        </Field>
      </div>

      <Button type="submit" isLoading={pending} className="w-full">
        Create Invitation
      </Button>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  );
}
