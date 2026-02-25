import type { SupabaseClient } from '@supabase/supabase-js';
import { enrichObjectiveWithPacing } from '@/lib/pacing';
import type { Objective, ObjectiveWithPacing } from '@/types/focusline';

export async function getAllObjectives(
  supabase: SupabaseClient,
): Promise<Objective[]> {
  const { data } = await supabase
    .from('objectives')
    .select('*')
    .order('department', { ascending: true })
    .order('weight', { ascending: false });

  return (data as Objective[]) ?? [];
}

export async function getObjectiveById(
  supabase: SupabaseClient,
  id: string,
): Promise<Objective | null> {
  const { data } = await supabase
    .from('objectives')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  return (data as Objective | null) ?? null;
}

export async function getObjectivesWithPacing(
  supabase: SupabaseClient,
): Promise<ObjectiveWithPacing[]> {
  const objectives = await getAllObjectives(supabase);
  return objectives.map(o => enrichObjectiveWithPacing(o));
}

export async function getCriticalByDepartment(
  supabase: SupabaseClient,
  department: string,
): Promise<ObjectiveWithPacing[]> {
  const { data } = await supabase
    .from('objectives')
    .select('*')
    .eq('department', department)
    .in('status', ['Critical', 'At-Risk'])
    .order('weight', { ascending: false });

  return ((data as Objective[]) ?? []).map(o => enrichObjectiveWithPacing(o));
}
