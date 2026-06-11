"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}

export async function markNotificationsRead() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return;
  try {
    await supabaseAdmin().from("notifications").update({ read_at: new Date().toISOString() })
      .eq("artist_email", user.email.toLowerCase()).is("read_at", null);
  } catch { /* table may not exist yet */ }
}
