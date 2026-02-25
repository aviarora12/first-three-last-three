'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/Badge';
import type { WorkStreamEntry } from '@/types/focusline';

interface WorkStreamTickerProps {
  initialEntries: WorkStreamEntry[];
}

export function WorkStreamTicker({ initialEntries }: WorkStreamTickerProps) {
  const [entries, setEntries] = useState<WorkStreamEntry[]>(initialEntries);

  useEffect(() => {
    const supabase = createClient();

    async function refreshWorkStream() {
      const { data } = await supabase.from('work_stream').select('*');
      if (data) setEntries(data as WorkStreamEntry[]);
    }

    // Subscribe to task table changes — on any change, re-query the view
    const channel = supabase
      .channel('work_stream_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => { refreshWorkStream(); },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (entries.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-zinc-600">
        No one is working on anything right now.
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-800/50">
      {entries.map(entry => (
        <div key={entry.task_id} className="px-4 py-3 flex items-center gap-3 hover:bg-zinc-900/50">
          {/* Avatar placeholder */}
          <div className="w-7 h-7 rounded-full bg-indigo-900 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-indigo-300">
              {(entry.full_name ?? '?')[0].toUpperCase()}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-100 font-medium truncate">
                {entry.full_name ?? 'Unknown'}
              </span>
              <span className="text-xs text-zinc-600">{entry.department}</span>
            </div>
            <p className="text-xs text-zinc-400 truncate mt-0.5">
              {entry.task_description}
            </p>
          </div>

          {/* Objective */}
          {entry.objective_title && (
            <div className="shrink-0 text-right max-w-[180px]">
              <p className="text-xs text-zinc-500 truncate">{entry.objective_title}</p>
              {entry.objective_status && (
                <StatusBadge status={entry.objective_status} className="mt-0.5" />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
