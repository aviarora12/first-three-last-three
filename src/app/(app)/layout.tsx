import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/focusline';

async function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
    >
      {label}
    </Link>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  const p = profile as Pick<Profile, 'full_name' | 'role'> | null;
  const isAdmin = p?.role === 'admin';

  async function signOut() {
    'use server';
    const supabase = createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold tracking-tight text-indigo-400">
              Focus<span className="text-zinc-100">Line</span>
            </span>
            <nav className="flex items-center gap-1">
              <NavLink href="/dashboard" label="Dashboard" />
              <NavLink href="/log" label="My Log" />
              <NavLink href="/objectives" label="Objectives" />
              {isAdmin && <NavLink href="/admin" label="Admin" />}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{p?.full_name ?? user.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
