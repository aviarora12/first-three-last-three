import { format, parseISO } from 'date-fns';

/** Returns today's date as 'YYYY-MM-DD' in local time. */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Formats an ISO date string or Date for display. */
export function formatDate(value: string | Date, fmt = 'MMM d, yyyy'): string {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return format(d, fmt);
}

/** Formats a timestamp for display (e.g. "8:45 AM"). */
export function formatTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return format(d, 'h:mm a');
}

/**
 * Lightweight class merger. Filters out falsy values, joins with spaces.
 * Avoids a clsx dependency for a simple use case.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Validates that a string is a reachable URL (structural check only). */
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Truncates a string to maxLen characters, appending '…' if trimmed. */
export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;
}
