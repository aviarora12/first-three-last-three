'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateObjectivePacing } from '@/lib/actions/objectives';
import { calculatePacing, formatPacingLabel, STATUS_COLORS } from '@/lib/pacing';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { ObjectiveWithPacing } from '@/types/focusline';

interface UpdatePacingFormProps {
  objective: ObjectiveWithPacing;
}

export function UpdatePacingForm({ objective }: UpdatePacingFormProps) {
  const router = useRouter();
  const [value, setValue]          = useState(String(objective.current_value));
  const [error, setError]          = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Live pacing preview (pure, client-side)
  const numericValue = parseFloat(value) || 0;
  const preview = calculatePacing({
    currentValue: numericValue,
    targetValue:  objective.target_value,
    startDate:    objective.start_date,
    endDate:      objective.end_date,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (numericValue < 0) {
      setError('Value must be 0 or greater');
      return;
    }

    startTransition(async () => {
      const result = await updateObjectivePacing(objective.id, numericValue);
      if (result.error) { setError(result.error); return; }
      router.push('/objectives');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-5">
      {error && (
        <div className="rounded bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Current state */}
      <div className="flex items-center justify-between p-3 rounded-md bg-zinc-800 border border-zinc-700">
        <div>
          <p className="text-xs text-zinc-500">Current value</p>
          <p className="text-lg font-bold text-zinc-100 font-mono">
            {objective.current_value.toLocaleString()}
          </p>
        </div>
        <StatusBadge status={objective.status} />
      </div>

      {/* New value input */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
          New Current Value (target: {objective.target_value.toLocaleString()})
        </label>
        <input
          type="number"
          className="input-base text-lg font-mono"
          value={value}
          onChange={e => setValue(e.target.value)}
          min="0"
          step="any"
          required
          autoFocus
        />
      </div>

      {/* Live pacing preview */}
      <div className="rounded-md border border-zinc-700 p-3 space-y-2">
        <p className="text-xs text-zinc-500 font-medium">Preview</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-mono" style={{ color: STATUS_COLORS[preview.status] }}>
            {preview.progressPct.toFixed(1)}% progress
          </span>
          <StatusBadge status={preview.status} />
        </div>
        <p className="text-xs text-zinc-400">{formatPacingLabel(preview.score)}</p>
        {preview.requiredDailyRate > 0 && (
          <p className="text-xs text-amber-400">
            +{preview.requiredDailyRate.toFixed(1)} / day still needed
          </p>
        )}
      </div>

      <Button type="submit" isLoading={pending} className="w-full">
        Save Update
      </Button>
    </form>
  );
}
