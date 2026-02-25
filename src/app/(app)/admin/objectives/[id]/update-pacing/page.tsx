import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getObjectiveById } from '@/lib/queries/objectives';
import { UpdatePacingForm } from '@/components/admin/UpdatePacingForm';
import { enrichObjectiveWithPacing } from '@/lib/pacing';

export const metadata: Metadata = { title: 'Update Pacing' };

export default async function UpdatePacingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const objective = await getObjectiveById(supabase, params.id);
  if (!objective) notFound();

  const enriched = enrichObjectiveWithPacing(objective);

  return (
    <div className="max-w-lg">
      <h2 className="text-base font-semibold text-zinc-200 mb-1">Update Pacing</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Update the current value for <strong className="text-zinc-300">{objective.title}</strong>.
        Status will be recomputed immediately.
      </p>
      <UpdatePacingForm objective={enriched} />
    </div>
  );
}
