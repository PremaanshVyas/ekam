"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/auth-server";
import { currentIdentity, ownerOr } from "@/lib/identity";
import { supabaseAdmin } from "@/lib/supabase";

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}

export async function markNotificationsRead() {
  const me = await currentIdentity();
  if (!me) return;
  try {
    await supabaseAdmin().from("notifications").update({ read_at: new Date().toISOString() })
      .or(ownerOr(me)).is("read_at", null);
  } catch { /* table may not exist yet */ }
}
