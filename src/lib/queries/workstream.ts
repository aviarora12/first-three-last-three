import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkStreamEntry } from '@/types/focusline';

export async function getWorkStream(
  supabase: SupabaseClient,
): Promise<WorkStreamEntry[]> {
  const { data } = await supabase
    .from('work_stream')
    .select('*');

  return (data as WorkStreamEntry[]) ?? [];
}
