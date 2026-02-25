import { STATUS_COLORS, formatPacingLabel } from '@/lib/pacing';
import type { PacingResult } from '@/types/focusline';

interface PacingBarProps {
  pacing: PacingResult;
}

export function PacingBar({ pacing }: PacingBarProps) {
  const fillPct  = Math.min(pacing.progressPct, 100);
  const tickPct  = Math.min(pacing.timeElapsedPct, 100);
  const color    = STATUS_COLORS[pacing.status];
  const label    = formatPacingLabel(pacing.score);

  return (
    <div className="space-y-1.5">
      {/* Bar */}
      <div
        className="relative h-2 rounded-full bg-zinc-800 overflow-visible"
        title={label}
      >
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${fillPct}%`, backgroundColor: color }}
        />
        {/* Pace tick — where progress SHOULD be */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-zinc-400 z-10"
          style={{ left: `${tickPct}%` }}
          title={`${pacing.timeElapsedPct.toFixed(1)}% of time elapsed`}
        />
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between text-xs">
        <span style={{ color }} className="font-mono font-semibold">
          {pacing.progressPct.toFixed(1)}%
        </span>
        <span className="text-zinc-600">{label}</span>
        <span className="text-zinc-600 font-mono">
          {pacing.daysRemaining}d left
        </span>
      </div>
    </div>
  );
}
