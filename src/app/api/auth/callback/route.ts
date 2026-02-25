import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { acceptInvitation } from '@/lib/invitations';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get('code');
  const token = searchParams.get('token') ?? request.cookies.get('fl_inv_token')?.value;
  const next  = searchParams.get('next') ?? '/log';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Belt-and-suspenders: apply invitation data (DB trigger already did this on signUp)
  if (token) {
    try {
      await acceptInvitation(supabase, token, data.user.id);
    } catch {
      // Non-fatal — trigger already handled it
    }
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  // Clear the invitation token cookie
  response.cookies.delete('fl_inv_token');
  return response;
}
