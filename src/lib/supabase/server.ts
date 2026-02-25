import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client for use in Server Components, Server Actions,
 * and Route Handlers. Reads and writes session cookies via next/headers.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — safe to ignore.
            // Middleware handles the actual cookie refresh.
          }
        },
      },
    },
  );
}

/**
 * Service-role client that bypasses RLS.
 * SERVER-SIDE ONLY — never expose the service role key to the browser.
 */
export function createServiceClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* service role doesn't manage user sessions */ },
      },
      auth: { persistSession: false },
    },
  );
}
