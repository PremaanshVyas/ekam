import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Auth-aware Supabase client for server components / actions / route handlers.
// Reads & writes the session via cookies (the @supabase/ssr pattern).
export async function createSupabaseServer() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(list) {
          // Throws in a Server Component render (read-only cookies) — safe to ignore;
          // sessions are written from the callback route + server actions.
          try {
            list.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {
            /* no-op */
          }
        },
      },
    },
  );
}
