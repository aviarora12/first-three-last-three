import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getObjectivesWithPacing } from '@/lib/queries/objectives';
import { ObjectiveCard } from '@/components/objectives/ObjectiveCard';
import type { Profile, ObjectiveWithPacing } from '@/types/focusline';

export const metadata: Metadata = { title: 'Objectives' };

export default async function ObjectivesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [objectives, profileData] = await Promise.all([
    getObjectivesWithPacing(supabase),
    supabase.from('profiles').select('role').eq('id', user!.id).single(),
  ]);

  const isAdmin = (profileData.data as Pick<Profile, 'role'> | null)?.role === 'admin';

  // Group by department
  const byDepartment = objectives.reduce<Record<string, ObjectiveWithPacing[]>>((acc, o) => {
    const dept = o.department || 'General';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(o);
    return acc;
  }, {});

  const depts = Object.keys(byDepartment).sort();

  if (objectives.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-zinc-100">Objectives</h1>
        <div className="card p-8 text-center text-zinc-500 text-sm">
          No objectives yet.{isAdmin && ' Create one in the Admin panel.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Objectives</h1>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" /> On-Track
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> At-Risk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Critical
          </span>
        </div>
      </div>

      {depts.map(dept => (
        <section key={dept} className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
            {dept}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {byDepartment[dept].map(obj => (
              <ObjectiveCard key={obj.id} objective={obj} isAdmin={isAdmin} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
