import type { SupabaseClient } from '@supabase/supabase-js';
import { todayISO } from '@/lib/utils';
import type { DailyLog, Task, Blocker } from '@/types/focusline';

export async function getTodayLog(
  supabase: SupabaseClient,
  userId: string,
): Promise<DailyLog | null> {
  const { data } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', todayISO())
    .maybeSingle();

  return (data as DailyLog | null) ?? null;
}

export async function getTasksForLog(
  supabase: SupabaseClient,
  logId: string,
): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('log_id', logId)
    .order('position', { ascending: true });

  return (data as Task[]) ?? [];
}

export async function getOpenBlockersForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<Array<Blocker & { task_description: string }>> {
  const { data } = await supabase
    .from('blockers')
    .select('*, tasks(description)')
    .eq('blocking_user_id', userId)
    .is('resolved_at', null);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...(row as Blocker),
    task_description: (row.tasks as { description: string } | null)?.description ?? '',
  }));
}
