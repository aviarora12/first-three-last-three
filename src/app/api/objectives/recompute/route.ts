import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/objectives/recompute
 *
 * Called by a daily cron job (Vercel Cron, GitHub Actions, or pg_cron via HTTP).
 * Calls the recompute_objective_statuses() PostgreSQL function which:
 *   1. Sweeps all active objectives
 *   2. Calculates PacingScore for each
 *   3. Updates status (On-Track / At-Risk / Critical)
 *   4. Returns only rows whose status changed
 *
 * Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  // Validate cron secret
  const auth = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Service-role client bypasses RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase.rpc('recompute_objective_statuses');

  if (error) {
    console.error('[recompute] RPC error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const changes = (data as Array<{ objective_id: string; pacing_score: number; new_status: string }>) ?? [];

  console.log(`[recompute] ${changes.length} status(es) changed`);

  return NextResponse.json({
    ok: true,
    changed: changes.length,
    changes,
    timestamp: new Date().toISOString(),
  });
}
