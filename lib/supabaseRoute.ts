// lib/supabaseRoute.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cookie-auth Supabase client for Next Route Handlers (App Router).
 * - Uses anon key (RLS applies)
 * - Reads/writes session cookies via Next's cookies() store
 * - No bearer tokens, no auth-helpers
 */
export function supabaseRoute() {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Route handlers can throw if cookies can't be set in some edge cases.
            // Safe to no-op; reads still work.
          }
        },
      },
    }
  );

  return supabase;
}