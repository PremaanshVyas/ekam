"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

export async function approve(id: string) {
  if (!(await isAdmin())) throw new Error("unauthorized");
  const db = supabaseAdmin();
  await db.from("tiles").update({ status: "published", published_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
  await db.from("moderation_log").insert({ tile_id: id, action: "approved" });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function reject(id: string) {
  if (!(await isAdmin())) throw new Error("unauthorized");
  const db = supabaseAdmin();
  // Rejection reopens the tile (clears artist data so it's claimable again).
  await db.from("tiles").update({
    status: "open", artist_name: null, artist_email: null, artist_location: null,
    story: null, image_path: null, claimed_at: null, claim_expires_at: null,
  }).eq("id", id).eq("status", "pending");
  await db.from("moderation_log").insert({ tile_id: id, action: "rejected" });
  revalidatePath("/admin");
  revalidatePath("/");
}
