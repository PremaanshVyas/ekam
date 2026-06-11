import { supabaseAdmin } from "@/lib/supabase";

// Best-effort notification insert — if migration 0006 hasn't run, this is a no-op.
export async function notify(
  db: ReturnType<typeof supabaseAdmin>, email: string | null | undefined,
  kind: "claim" | "live" | "returned" | "mod-approved" | "mod-rejected" | "top" | "expiring" | "expired",
  title: string, body: string,
): Promise<void> {
  if (!email) return;
  try { await db.from("notifications").insert({ artist_email: email.toLowerCase(), kind, title, body }); } catch { /* table may not exist yet */ }
}
