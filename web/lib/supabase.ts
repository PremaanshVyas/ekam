import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Anon client — public reads (the `public_tiles` view). Safe in server components.
export const supabaseAnon = () =>
  createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// Service-role client — SERVER ONLY (route handlers / server actions). Bypasses
// RLS for claim/submit/moderate. Never import this into a client component.
export const supabaseAdmin = () =>
  createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

export const CANVAS_SLUG = "what-home-looks-like";
