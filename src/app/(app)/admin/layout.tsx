import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/focusline';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if ((data as Pick<Profile, 'role'> | null)?.role !== 'admin') notFound();

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="text-xl font-bold text-zinc-100">Admin</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Manage users, objectives, and reminders</p>
      </div>
      {children}
    </div>
  );
}
