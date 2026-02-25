import Link from 'next/link';
import { StatusBadge } from '@/components/ui/Badge';
import { PacingBar } from './PacingBar';
import type { ObjectiveWithPacing } from '@/types/focusline';
import { formatDate } from '@/lib/utils';

interface ObjectiveCardProps {
  objective: ObjectiveWithPacing;
  isAdmin?: boolean;
}

function periodLabel(obj: ObjectiveWithPacing): string {
  if (obj.period_type === 'annual') return `FY${obj.period_year}`;
  if (obj.period_type === 'monthly') {
    const month = new Date(2000, (obj.period_month ?? 1) - 1).toLocaleString('en-US', { month: 'short' });
    return `${month} ${obj.period_year}`;
  }
  return `${formatDate(obj.start_date, 'MMM d')} – ${formatDate(obj.end_date, 'MMM d')}`;
}

export function ObjectiveCard({ objective, isAdmin }: ObjectiveCardProps) {
  const { pacing } = objective;

  return (
    <div className="card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100 truncate">{objective.title}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{periodLabel(objective)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={objective.status} />
          {/* Weight indicator */}
          <span className="text-xs text-zinc-600 font-mono">W{objective.weight}</span>
        </div>
      </div>

      {/* Pacing bar */}
      <PacingBar pacing={pacing} />

      {/* Numbers */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          <span className="text-zinc-300 font-mono">{objective.current_value.toLocaleString()}</span>
          {' / '}
          <span className="font-mono">{objective.target_value.toLocaleString()}</span>
        </span>
        {pacing.requiredDailyRate > 0 && (
          <span className="text-amber-500">
            +{pacing.requiredDailyRate.toFixed(1)}/day needed
          </span>
        )}
      </div>

      {/* Admin action */}
      {isAdmin && (
        <div className="pt-1 border-t border-zinc-800">
          <Link
            href={`/admin/objectives/${objective.id}/update-pacing`}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Update current value →
          </Link>
        </div>
      )}
    </div>
  );
}
