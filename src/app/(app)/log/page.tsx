import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { createOrGetTodayLog } from '@/lib/actions/log';
import { getTasksForLog } from '@/lib/queries/log';
import { getAllObjectives } from '@/lib/queries/objectives';
import { getCatalystData, buildSuggestedTasks } from '@/lib/queries/catalyst';
import { DailyLogPanel } from '@/components/log/DailyLogPanel';
import { CatalystPanel } from '@/components/catalyst/CatalystPanel';
import { formatDate } from '@/lib/utils';
import type { Profile } from '@/types/focusline';

export const metadata: Metadata = { title: 'My Log' };

export default async function LogPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profileData } = await supabase
    .from('profiles')
    .select('title, job_description, department, full_name')
    .eq('id', user.id)
    .single();

  const profile = profileData as Pick<Profile, 'title' | 'job_description' | 'department' | 'full_name'> | null;

  // Ensure today's log exists (upsert)
  const log = await createOrGetTodayLog();

  // Fetch all data in parallel
  const [tasks, objectives, catalystData] = await Promise.all([
    getTasksForLog(supabase, log.id),
    getAllObjectives(supabase),
    getCatalystData(supabase, user.id, profile?.department ?? ''),
  ]);

  const suggestedTasks = buildSuggestedTasks(
    catalystData.blockers,
    catalystData.criticalObjectives,
    profile ?? { title: null, job_description: null, department: '' },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">My Daily Log</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{formatDate(new Date())}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main log */}
        <div className="lg:col-span-2">
          <DailyLogPanel log={log} tasks={tasks} objectives={objectives} />
        </div>

        {/* Catalyst sidebar */}
        <div>
          <CatalystPanel
            suggestedTasks={suggestedTasks}
            logId={log.id}
            existingTaskCount={tasks.length}
          />
        </div>
      </div>
    </div>
  );
}
