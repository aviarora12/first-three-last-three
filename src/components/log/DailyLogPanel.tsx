'use client';

import { useState, useTransition } from 'react';
import { lockF3, closeDay } from '@/lib/actions/log';
import { TaskRow } from './TaskRow';
import { Button } from '@/components/ui/Button';
import type { DailyLog, Task, Objective } from '@/types/focusline';

interface DailyLogPanelProps {
  log: DailyLog;
  tasks: Task[];
  objectives: Objective[];
}

function taskAtPosition(tasks: Task[], position: number): Task | null {
  return tasks.find(t => t.position === position) ?? null;
}

export function DailyLogPanel({ log, tasks, objectives }: DailyLogPanelProps) {
  const [f3Locked, setF3Locked]     = useState(!!log.f3_completed_at);
  const [dayClosed, setDayClosed]   = useState(!!log.l3_completed_at);
  const [error, setError]           = useState<string | null>(null);
  const [pending, startTransition]  = useTransition();

  function handleLockF3() {
    setError(null);
    startTransition(async () => {
      const result = await lockF3(log.id);
      if (result.error) { setError(result.error); return; }
      setF3Locked(true);
    });
  }

  function handleCloseDay() {
    setError(null);
    startTransition(async () => {
      const result = await closeDay(log.id);
      if (result.error) { setError(result.error); return; }
      setDayClosed(true);
    });
  }

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── First Three ───────────────────────────────── */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-100">First Three</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {f3Locked ? `Locked at ${new Date(log.f3_completed_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "What are you committing to today?"}
            </p>
          </div>
          {!f3Locked && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleLockF3}
              isLoading={pending}
            >
              Lock F3
            </Button>
          )}
          {f3Locked && (
            <span className="text-xs text-green-400 font-medium">✓ Locked</span>
          )}
        </div>

        <div className="space-y-2">
          {[0, 1, 2].map(pos => (
            <TaskRow
              key={pos}
              task={taskAtPosition(tasks, pos)}
              position={pos}
              logId={log.id}
              objectives={objectives}
              locked={f3Locked}
              label={`F${pos + 1}`}
            />
          ))}
        </div>
      </section>

      {/* ── Last Three ────────────────────────────────── */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Last Three</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {dayClosed
                ? `Day closed at ${new Date(log.l3_completed_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Document what you shipped. Each task needs an artifact URL.'}
            </p>
          </div>
          {!dayClosed && (
            <Button
              size="sm"
              variant="primary"
              onClick={handleCloseDay}
              isLoading={pending}
            >
              Close Day
            </Button>
          )}
          {dayClosed && (
            <span className="text-xs text-green-400 font-medium">✓ Day Closed</span>
          )}
        </div>

        {log.rollover_count > 0 && (
          <div className="rounded bg-amber-950 border border-amber-800 px-3 py-2 text-xs text-amber-400">
            ⚠ {log.rollover_count} task(s) rolled over from yesterday
          </div>
        )}

        <div className="space-y-2">
          {[3, 4, 5].map(pos => (
            <TaskRow
              key={pos}
              task={taskAtPosition(tasks, pos)}
              position={pos}
              logId={log.id}
              objectives={objectives}
              locked={dayClosed}
              label={`L${pos - 2}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
