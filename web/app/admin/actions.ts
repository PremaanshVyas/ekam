"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

export async function approve(id: string) {
  if (!(await isAdmin())) throw new Error("unauthorized");
  const db = supabaseAdmin();
  const { data: tile } = await db.from("tiles").select("pending_image_path, pending_story").eq("id", id).maybeSingle();
  if (!tile) return;

  if (tile.pending_image_path) {
    // Approving an edit to an already-published tile → promote the pending edit to live.
    await db.from("tiles").update({
      image_path: tile.pending_image_path,
      story: tile.pending_story,
      pending_image_path: null, pending_story: null, pending_submitted_at: null,
      published_at: new Date().toISOString(),
    }).eq("id", id);
  } else {
    // Approving a new tile.
    await db.from("tiles").update({ status: "published", published_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
  }
  await db.from("moderation_log").insert({ tile_id: id, action: "approved" });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function reject(id: string) {
  if (!(await isAdmin())) throw new Error("unauthorized");
  const db = supabaseAdmin();
  const { data: tile } = await db.from("tiles").select("pending_image_path").eq("id", id).maybeSingle();
  if (!tile) return;

  if (tile.pending_image_path) {
    // Rejecting an edit → drop the pending edit; the live published tile stays untouched.
    await db.from("tiles").update({ pending_image_path: null, pending_story: null, pending_submitted_at: null }).eq("id", id);
  } else {
    // Rejecting a new tile → reopen it (clears artist data so it's claimable again).
    await db.from("tiles").update({
      status: "open", artist_name: null, artist_email: null, artist_location: null,
      story: null, image_path: null, claimed_at: null, claim_expires_at: null,
    }).eq("id", id).eq("status", "pending");
  }
  await db.from("moderation_log").insert({ tile_id: id, action: "rejected" });
  revalidatePath("/admin");
  revalidatePath("/");
}
