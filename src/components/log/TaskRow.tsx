'use client';

import { useState, useRef } from 'react';
import { upsertTask, markTaskInProgress } from '@/lib/actions/log';
import { ArtifactInput } from './ArtifactInput';
import type { Task, Objective, TaskStatus } from '@/types/focusline';

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending:     '○',
  in_progress: '◑',
  complete:    '●',
  incomplete:  '✕',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending:     'text-zinc-500',
  in_progress: 'text-indigo-400',
  complete:    'text-green-400',
  incomplete:  'text-red-400',
};

interface TaskRowProps {
  task: Task | null;  // null = empty slot
  position: number;
  logId: string;
  objectives: Objective[];
  locked: boolean;    // F3 locked or day closed
  label: string;      // e.g. "F1", "L2"
}

export function TaskRow({ task, position, logId, objectives, locked, label }: TaskRowProps) {
  const [description, setDescription] = useState(task?.description ?? '');
  const [objectiveId, setObjectiveId] = useState(task?.objective_id ?? '');
  const [status, setStatus]           = useState<TaskStatus>(task?.status ?? 'pending');
  const [saving, setSaving]           = useState(false);
  const taskId = task?.id;

  const descRef = useRef<HTMLTextAreaElement>(null);

  async function saveTask(overrides: Partial<Parameters<typeof upsertTask>[0]> = {}) {
    if (!description.trim()) return;
    setSaving(true);
    await upsertTask({
      ...(taskId ? { id: taskId } : {}),
      log_id:       logId,
      description,
      position,
      objective_id: objectiveId || null,
      status,
      ...overrides,
    });
    setSaving(false);
  }

  async function cycleStatus() {
    if (locked) return;
    const next: Record<TaskStatus, TaskStatus> = {
      pending:     'in_progress',
      in_progress: 'complete',
      complete:    'pending',
      incomplete:  'pending',
    };
    const nextStatus = next[status];
    setStatus(nextStatus);
    await saveTask({ status: nextStatus });
    if (nextStatus === 'in_progress') {
      await markTaskInProgress(taskId ?? '');
    }
  }

  return (
    <div className={`space-y-2 p-3 rounded-md border transition-colors ${
      locked
        ? 'border-zinc-800 bg-zinc-900/30 opacity-75'
        : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
    }`}>
      <div className="flex items-start gap-2">
        {/* Position label */}
        <span className="text-xs font-mono text-zinc-600 mt-1 shrink-0 w-5">{label}</span>

        {/* Status toggle */}
        <button
          onClick={cycleStatus}
          disabled={locked}
          className={`text-lg shrink-0 mt-0.5 transition-colors ${STATUS_COLORS[status]} ${locked ? 'cursor-default' : 'hover:scale-110'}`}
          title={`Status: ${status}`}
        >
          {STATUS_LABELS[status]}
        </button>

        {/* Description */}
        <textarea
          ref={descRef}
          className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600
                     resize-none outline-none min-h-[1.5rem] leading-relaxed"
          placeholder={locked ? '—' : 'Describe this task…'}
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={() => saveTask()}
          rows={1}
          disabled={locked}
          onInput={e => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }}
        />

        {saving && <span className="text-xs text-zinc-600 shrink-0 mt-1">saving…</span>}
      </div>

      {/* Objective picker */}
      {!locked && description.trim() && (
        <div className="pl-7">
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-400
                       px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={objectiveId}
            onChange={e => { setObjectiveId(e.target.value); saveTask({ objective_id: e.target.value || null }); }}
          >
            <option value="">No objective</option>
            {objectives.map(o => (
              <option key={o.id} value={o.id}>
                [{o.status}] {o.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Artifact URL — appears when task is complete */}
      {status === 'complete' && taskId && (
        <div className="pl-7">
          <ArtifactInput
            taskId={taskId}
            logId={logId}
            position={position}
            initialUrl={task?.artifact_url ?? null}
            description={description}
            objectiveId={objectiveId || null}
          />
        </div>
      )}
    </div>
  );
}
