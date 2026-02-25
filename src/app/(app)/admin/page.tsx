import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listInvitations } from '@/lib/invitations';
import { InvitationTable } from '@/components/admin/InvitationTable';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminPage() {
  const supabase = createClient();
  const invitations = await listInvitations(supabase);

  return (
    <div className="space-y-8">
      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/invite"
          className="card p-4 hover:border-zinc-700 transition-colors flex items-center gap-3"
        >
          <span className="text-2xl">✉️</span>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Invite User</p>
            <p className="text-xs text-zinc-500">Send an invitation link</p>
          </div>
        </Link>
        <Link
          href="/admin/objectives/new"
          className="card p-4 hover:border-zinc-700 transition-colors flex items-center gap-3"
        >
          <span className="text-2xl">🎯</span>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Create Objective</p>
            <p className="text-xs text-zinc-500">Monthly, annual, or custom</p>
          </div>
        </Link>
      </div>

      {/* Invitations */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
            Invitations
          </h2>
          <Link
            href="/admin/invite"
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            + New invite
          </Link>
        </div>
        <InvitationTable invitations={invitations} />
      </section>
    </div>
  );
}
