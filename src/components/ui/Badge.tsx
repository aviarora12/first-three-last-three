import type { ObjectiveStatus } from '@/types/focusline';

const STYLES: Record<ObjectiveStatus, string> = {
  'On-Track': 'bg-green-950 text-green-400 border-green-800',
  'At-Risk':  'bg-amber-950 text-amber-400 border-amber-800',
  'Critical': 'bg-red-950  text-red-400   border-red-800',
};

const DOTS: Record<ObjectiveStatus, string> = {
  'On-Track': 'bg-green-400',
  'At-Risk':  'bg-amber-400',
  'Critical': 'bg-red-400 animate-pulse',
};

interface BadgeProps {
  status: ObjectiveStatus;
  className?: string;
}

export function StatusBadge({ status, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full
                  text-xs font-semibold border ${STYLES[status]} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${DOTS[status]}`} />
      {status}
    </span>
  );
}
