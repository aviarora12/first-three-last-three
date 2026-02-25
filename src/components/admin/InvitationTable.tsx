'use client';

import { useTransition } from 'react';
import { revokeInvite } from '@/lib/actions/admin';
import { invitationStatus } from '@/types/focusline';
import type { Invitation, InvitationStatus } from '@/types/focusline';
import { formatDate } from '@/lib/utils';

const STATUS_STYLES: Record<InvitationStatus, string> = {
  pending:  'text-amber-400 bg-amber-950 border-amber-800',
  accepted: 'text-green-400 bg-green-950 border-green-800',
  expired:  'text-zinc-500 bg-zinc-800 border-zinc-700',
};

interface InvitationTableProps {
  invitations: Array<Invitation & { computed_status: InvitationStatus }>;
}

export function InvitationTable({ invitations }: InvitationTableProps) {
  const [pending, startTransition] = useTransition();

  if (invitations.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-zinc-500">
        No invitations yet.
      </div>
    );
  }

  function handleRevoke(id: string) {
    startTransition(() => revokeInvite(id));
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
            <th className="text-left px-4 py-2 font-medium">Email</th>
            <th className="text-left px-4 py-2 font-medium">Role</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-left px-4 py-2 font-medium">Expires</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {invitations.map(inv => (
            <tr key={inv.id} className="hover:bg-zinc-900/50">
              <td className="px-4 py-2.5 text-zinc-200">{inv.email}</td>
              <td className="px-4 py-2.5 text-zinc-400 capitalize">{inv.role}</td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[inv.computed_status]}`}>
                  {inv.computed_status}
                </span>
              </td>
              <td className="px-4 py-2.5 text-zinc-500 text-xs">{formatDate(inv.expires_at)}</td>
              <td className="px-4 py-2.5 text-right">
                {inv.computed_status === 'pending' && (
                  <button
                    onClick={() => handleRevoke(inv.id)}
                    disabled={pending}
                    className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
