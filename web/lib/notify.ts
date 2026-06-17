import { supabaseAdmin } from "@/lib/supabase";

// Who to notify. Either field may be absent: anonymous owners have only a userId; legacy
// email-claimed tiles (pre-0010) have only an email. Notifications are read back by
// whichever the viewer's session carries (see /canvas).
export type Recipient = { email?: string | null; userId?: string | null };

// Best-effort notification insert — fails soft if the table/columns aren't there yet.
export async function notify(
  db: ReturnType<typeof supabaseAdmin>, to: Recipient | string | null | undefined,
  kind: "claim" | "live" | "returned" | "mod-approved" | "mod-rejected" | "top" | "expiring" | "expired",
  title: string, body: string,
): Promise<void> {
  // tolerate the old string-email call shape during the transition
  const r: Recipient = typeof to === "string" ? { email: to } : (to ?? {});
  const email = r.email ? r.email.toLowerCase() : null;
  const userId = r.userId ?? null;
  if (!email && !userId) return; // nobody to notify
  try {
    await db.from("notifications").insert({ artist_email: email, artist_user_id: userId, kind, title, body });
  } catch {
    // pre-0010 (no artist_user_id, email NOT NULL): retry the old shape when we have an email
    try { if (email) await db.from("notifications").insert({ artist_email: email, kind, title, body }); } catch { /* table may not exist yet */ }
  }
}
