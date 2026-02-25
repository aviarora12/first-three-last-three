import type { Metadata } from 'next';
import { InviteForm } from '@/components/admin/InviteForm';

export const metadata: Metadata = { title: 'Invite User' };

export default function InvitePage() {
  return (
    <div className="max-w-lg">
      <h2 className="text-base font-semibold text-zinc-200 mb-4">Invite a Team Member</h2>
      <InviteForm />
    </div>
  );
}
