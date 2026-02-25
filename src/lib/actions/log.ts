'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { todayISO } from '@/lib/utils';
import type { DailyLog, Task, TaskStatus } from '@/types/focusline';

// =============================================================================
// createOrGetTodayLog
// Upserts a DailyLog row for (user, today). Safe to call on every page load.
// =============================================================================

export async function createOrGetTodayLog(): Promise<DailyLog> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const today = todayISO();

  const { data, error } = await supabase
    .from('daily_logs')
    .upsert(
      { user_id: user.id, date: today },
      { onConflict: 'user_id,date', ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) throw new Error(`createOrGetTodayLog: ${error.message}`);
  return data as DailyLog;
}

// =============================================================================
// upsertTask
// =============================================================================

const UpsertTaskSchema = z.object({
  id:           z.string().uuid().optional(),
  log_id:       z.string().uuid(),
  description:  z.string().min(1, 'Description is required').max(500),
  position:     z.number().int().min(0).max(5),
  objective_id: z.string().uuid().nullable().optional(),
  status:       z.enum(['pending', 'in_progress', 'complete', 'incomplete']).optional(),
  artifact_url: z.string().url('Must be a valid URL').nullable().optional(),
  is_suggested: z.boolean().optional(),
});

export type UpsertTaskInput = z.infer<typeof UpsertTaskSchema>;

export async function upsertTask(
  input: UpsertTaskInput,
): Promise<{ task?: Task; error?: string }> {
  const parsed = UpsertTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('tasks')
    .upsert(parsed.data, { onConflict: 'id' })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/log');
  return { task: data as Task };
}

// =============================================================================
// lockF3 — stamps f3_completed_at on a log once the first 3 tasks are set
// =============================================================================

export async function lockF3(logId: string): Promise<{ error?: string }> {
  const supabase = createClient();

  // Verify positions 0–2 all have tasks with a description
  const { data: tasks, error: fetchErr } = await supabase
    .from('tasks')
    .select('position, description')
    .eq('log_id', logId)
    .in('position', [0, 1, 2]);

  if (fetchErr) return { error: fetchErr.message };

  const positions = (tasks ?? []).map((t: { position: number }) => t.position);
  if (!([0, 1, 2].every(p => positions.includes(p)))) {
    return { error: 'All three First Three tasks must be filled in before locking.' };
  }

  const { error } = await supabase
    .from('daily_logs')
    .update({ f3_completed_at: new Date().toISOString() })
    .eq('id', logId)
    .is('f3_completed_at', null); // idempotent — only lock once

  if (error) return { error: error.message };

  revalidatePath('/log');
  revalidatePath('/dashboard');
  return {};
}

// =============================================================================
// closeDay — stamps l3_completed_at; enforces artifact_url on all L3 tasks
// =============================================================================

export async function closeDay(logId: string): Promise<{ error?: string }> {
  const supabase = createClient();

  // Verify positions 3–5 all have tasks with artifact_url set
  const { data: l3Tasks, error: fetchErr } = await supabase
    .from('tasks')
    .select('position, description, artifact_url, status')
    .eq('log_id', logId)
    .in('position', [3, 4, 5]);

  if (fetchErr) return { error: fetchErr.message };

  const positions = (l3Tasks ?? []).map((t: { position: number }) => t.position);
  if (!([3, 4, 5].every(p => positions.includes(p)))) {
    return { error: 'All three Last Three tasks must be filled in before closing.' };
  }

  const missing = (l3Tasks ?? []).filter(
    (t: { artifact_url: string | null }) => !t.artifact_url,
  );
  if (missing.length > 0) {
    return {
      error: `${missing.length} Last Three task(s) are missing an artifact URL. Add a link to your work before closing.`,
    };
  }

  // Mark any L3 tasks still 'in_progress' as 'complete'
  await supabase
    .from('tasks')
    .update({ status: 'complete' as TaskStatus })
    .eq('log_id', logId)
    .in('position', [3, 4, 5])
    .eq('status', 'in_progress');

  const { error } = await supabase
    .from('daily_logs')
    .update({ l3_completed_at: new Date().toISOString() })
    .eq('id', logId)
    .is('l3_completed_at', null);

  if (error) return { error: error.message };

  revalidatePath('/log');
  revalidatePath('/dashboard');
  return {};
}

// =============================================================================
// markTaskInProgress
// =============================================================================

export async function markTaskInProgress(taskId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'in_progress' as TaskStatus })
    .eq('id', taskId);

  if (error) return { error: error.message };

  revalidatePath('/log');
  revalidatePath('/dashboard');
  return {};
}

// =============================================================================
// createBlocker
// =============================================================================

const CreateBlockerSchema = z.object({
  blocked_task_id:  z.string().uuid(),
  blocking_user_id: z.string().uuid(),
  resolution_eta:   z.string().datetime().nullable().optional(),
  notes:            z.string().max(1000).optional(),
});

export type CreateBlockerInput = z.infer<typeof CreateBlockerSchema>;

export async function createBlocker(
  input: CreateBlockerInput,
): Promise<{ error?: string }> {
  const parsed = CreateBlockerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = createClient();
  const { error } = await supabase.from('blockers').insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath('/log');
  return {};
}

// =============================================================================
// resolveBlocker
// =============================================================================

export async function resolveBlocker(blockerId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('blockers')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', blockerId)
    .is('resolved_at', null);

  if (error) return { error: error.message };

  revalidatePath('/log');
  return {};
}
