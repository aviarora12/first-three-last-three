import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getTodayLog } from '@/lib/queries/log';
import { getWorkStream } from '@/lib/queries/workstream';
import { WorkStreamTicker } from '@/components/work-stream/WorkStreamTicker';
import { formatDate, formatTime } from '@/lib/utils';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [log, workStream] = await Promise.all([
    user ? getTodayLog(supabase, user.id) : null,
    getWorkStream(supabase),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Command Center</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{formatDate(new Date())}</p>
        </div>
      </div>

      {/* Today's status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard
          label="First Three"
          value={log?.f3_completed_at ? formatTime(log.f3_completed_at) : null}
          emptyLabel="Not locked in"
          href="/log"
          state={log?.f3_completed_at ? 'complete' : 'pending'}
        />
        <StatusCard
          label="Day Closed"
          value={log?.l3_completed_at ? formatTime(log.l3_completed_at) : null}
          emptyLabel="Day still open"
          href="/log"
          state={log?.l3_completed_at ? 'complete' : 'pending'}
        />
        <StatusCard
          label="Rollover Penalty"
          value={log?.rollover_count ? `${log.rollover_count} tasks` : null}
          emptyLabel="None"
          href="/log"
          state={log && log.rollover_count > 0 ? 'warning' : 'complete'}
        />
      </div>

      {/* Work-stream ticker */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Live Work-Stream
          </span>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse-slow" />
        </div>
        <WorkStreamTicker initialEntries={workStream} />
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  emptyLabel,
  href,
  state,
}: {
  label: string;
  value: string | null;
  emptyLabel: string;
  href: string;
  state: 'complete' | 'pending' | 'warning';
}) {
  const stateStyles = {
    complete: 'text-green-400',
    pending:  'text-zinc-500',
    warning:  'text-amber-400',
  };

  return (
    <Link href={href} className="card p-4 hover:border-zinc-700 transition-colors block">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-lg font-bold ${stateStyles[state]}`}>
        {value ?? emptyLabel}
      </p>
    </Link>
  );
}
