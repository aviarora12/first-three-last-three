'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next   = params.get('next') ?? '/dashboard';

  const [email, setEmail]   = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setError(error.message);
        return;
      }

      router.push(next);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="card p-6 space-y-4">
        <h1 className="text-lg font-semibold text-zinc-100">Sign in</h1>

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
            className="input-base"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
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
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-2 px-4 rounded-md bg-indigo-600 hover:bg-indigo-500
                     text-sm font-semibold text-white transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </div>

      <p className="text-center text-xs text-zinc-600">
        Access is by invitation only. Contact your admin.
      </p>
    </form>
  );
}
