'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { Objective } from '@/types/focusline';

// =============================================================================
// createObjective
// For monthly/annual, the DB trigger derives start_date and end_date.
// =============================================================================

const MonthlySchema = z.object({
  period_type:    z.literal('monthly'),
  period_year:    z.number().int().min(2020).max(2099),
  period_month:   z.number().int().min(1).max(12),
  title:          z.string().min(1).max(200),
  description:    z.string().max(2000).nullable().optional(),
  department:     z.string().min(1),
  weight:         z.number().int().min(1).max(10),
  target_value:   z.number().positive(),
  current_value:  z.number().min(0).optional().default(0),
  owner_id:       z.string().uuid().nullable().optional(),
});

const AnnualSchema = z.object({
  period_type:    z.literal('annual'),
  period_year:    z.number().int().min(2020).max(2099),
  period_month:   z.null().optional(),
  title:          z.string().min(1).max(200),
  description:    z.string().max(2000).nullable().optional(),
  department:     z.string().min(1),
  weight:         z.number().int().min(1).max(10),
  target_value:   z.number().positive(),
  current_value:  z.number().min(0).optional().default(0),
  owner_id:       z.string().uuid().nullable().optional(),
});

const CustomSchema = z.object({
  period_type:    z.literal('custom'),
  period_year:    z.null().optional(),
  period_month:   z.null().optional(),
  start_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title:          z.string().min(1).max(200),
  description:    z.string().max(2000).nullable().optional(),
  department:     z.string().min(1),
  weight:         z.number().int().min(1).max(10),
  target_value:   z.number().positive(),
  current_value:  z.number().min(0).optional().default(0),
  owner_id:       z.string().uuid().nullable().optional(),
});

const ObjectiveInputSchema = z.discriminatedUnion('period_type', [
  MonthlySchema,
  AnnualSchema,
  CustomSchema,
]);

type ObjectiveFormInput = z.infer<typeof ObjectiveInputSchema>;

export async function createObjective(
  input: ObjectiveFormInput,
): Promise<{ objective?: Objective; error?: string }> {
  const parsed = ObjectiveInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('objectives')
    .insert(parsed.data)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/objectives');
  revalidatePath('/admin');
  return { objective: data as Objective };
}

// =============================================================================
// updateObjectivePacing
// Updates current_value. The next cron run recomputes status.
// Optionally calls recompute_objective_statuses() immediately.
// =============================================================================

export async function updateObjectivePacing(
  objectiveId: string,
  currentValue: number,
): Promise<{ objective?: Objective; error?: string }> {
  if (typeof currentValue !== 'number' || currentValue < 0) {
    return { error: 'current_value must be a non-negative number' };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('objectives')
    .update({ current_value: currentValue })
    .eq('id', objectiveId)
    .select()
    .single();

  if (error) return { error: error.message };

  // Immediately recompute status for this objective so the UI reflects it
  await supabase.rpc('recompute_objective_statuses');

  revalidatePath('/objectives');
  revalidatePath('/admin');
  revalidatePath(`/admin/objectives/${objectiveId}/update-pacing`);
  return { objective: data as Objective };
}
