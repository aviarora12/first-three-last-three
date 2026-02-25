'use client';

import { useState, useTransition } from 'react';
import { upsertTask } from '@/lib/actions/log';
import { Button } from '@/components/ui/Button';
import type { SuggestedTask } from '@/lib/queries/catalyst';

interface CatalystPanelProps {
  suggestedTasks: SuggestedTask[];
  logId: string;
  existingTaskCount: number;
}

export function CatalystPanel({
  suggestedTasks,
  logId,
  existingTaskCount,
}: CatalystPanelProps) {
  const [accepted, setAccepted]    = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError]          = useState<string | null>(null);

  function handleAccept(task: SuggestedTask, index: number) {
    // Find next free F3 slot (positions 0–2)
    const usedF3Positions = existingTaskCount;
    const nextPosition = usedF3Positions + accepted.size;

    if (nextPosition > 2) {
      setError('Your First Three are full. Remove a task before accepting a suggestion.');
      return;
    }

    startTransition(async () => {
      const result = await upsertTask({
        log_id:       logId,
        description:  task.description,
        position:     nextPosition,
        objective_id: task.objectiveId ?? undefined,
        is_suggested: true,
        status:       'pending',
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setAccepted(prev => new Set(prev).add(index));
    });
  }

  if (suggestedTasks.length === 0) {
    return (
      <div className="card p-4 text-center">
        <p className="text-sm font-semibold text-zinc-100 mb-1">Catalyst</p>
        <p className="text-xs text-zinc-500">
          No priority alerts. All objectives are on track and you have no open blockers.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-zinc-100">Catalyst</span>
          <span className="text-xs text-indigo-400 font-mono">Priority Check</span>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">
          Based on your blockers and department objectives
        </p>
      </div>

      {error && (
        <div className="rounded bg-red-950 border border-red-800 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Suggestions */}
      <div className="space-y-3">
        {suggestedTasks.map((task, i) => (
          <div
            key={i}
            className={`rounded-md border p-3 space-y-2 transition-colors ${
              accepted.has(i)
                ? 'border-green-800 bg-green-950/30'
                : 'border-zinc-700 bg-zinc-800/50'
            }`}
          >
            <p className="text-xs text-zinc-200 font-medium leading-relaxed">
              {task.description}
            </p>
            {task.objectiveTitle && (
              <p className="text-xs text-indigo-400">→ {task.objectiveTitle}</p>
            )}
            <p className="text-xs text-zinc-500 leading-relaxed">{task.reason}</p>

            {accepted.has(i) ? (
              <p className="text-xs text-green-400 font-medium">✓ Added to First Three</p>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAccept(task, i)}
                isLoading={pending}
                className="w-full"
              >
                Accept Suggestion
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
