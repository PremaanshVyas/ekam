"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";
import { publishTile } from "@/lib/publish";
import { broadcastWallChange } from "@/lib/broadcast";
import { notify } from "@/lib/notify";

// Re-run the AI screen on one tile (also handy as a one-click live test).
export async function screenTile(id: string) {
  if (!(await isAdmin())) throw new Error("unauthorized");
  // clear the previous verdict so the screening lock treats this as a fresh cycle
  await supabaseAdmin().from("tiles").update({ ai_verdict: null, ai_reason: null, ai_checked_at: null }).eq("id", id);
  const { moderateTile } = await import("@/lib/moderate");
  await moderateTile(id);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function approve(id: string) {
  if (!(await isAdmin())) throw new Error("unauthorized");
  await publishTile(supabaseAdmin(), id, "admin");
  revalidatePath("/admin");
  revalidatePath("/");
}

// Reject RETURNS the tile to its artist (they keep the tile + painting and can rework
// it); it never un-claims — that's what "remove" is for. Rejected edits are dropped
// while the live tile stays on the wall. The artist hears about it in their bell.
export async function reject(id: string) {
  if (!(await isAdmin())) throw new Error("unauthorized");
  const db = supabaseAdmin();
  const { data: tile } = await db.from("tiles").select("pending_image_path, artist_email, x, y, status").eq("id", id).maybeSingle();
  if (!tile) return;
  const lbl = `R${String(tile.y + 1).padStart(2, "0")}·C${String(tile.x + 1).padStart(2, "0")}`;

  if (tile.pending_image_path) {
    await db.from("tiles").update({ pending_image_path: null, pending_story: null, pending_submitted_at: null }).eq("id", id);
    await notify(db, tile.artist_email, "mod-rejected", `Your update to ${lbl} was rejected`, "The moderator reviewed your new version and rejected it. Your previously approved tile stays live on the wall. You can paint a different update anytime.");
  } else {
    await db.from("tiles").update({ status: "claimed" }).eq("id", id).eq("status", "pending");
    await notify(db, tile.artist_email, "mod-rejected", `Your tile ${lbl} was rejected`, "The moderator reviewed your tile manually and rejected it. The tile is still yours. Paint something new and submit again.");
  }
  await db.from("tiles").update({ review_requested_at: null }).eq("id", id); // best-effort (0006)
  await db.from("moderation_log").insert({ tile_id: id, action: "rejected" });
  await broadcastWallChange();
  revalidatePath("/admin");
  revalidatePath("/");
}

// Take a tile fully back to "open" — clears the painting AND the artist (email, name,
// story). Frees the tile so it (and that email) can be claimed again.
export async function removeTile(id: string) {
  if (!(await isAdmin())) throw new Error("unauthorized");
  const db = supabaseAdmin();
  const full = {
    status: "open", artist_name: null, artist_email: null, artist_location: null,
    story: null, image_path: null, thumb_path: null, claimed_at: null, claim_expires_at: null,
    published_at: null, pending_image_path: null, pending_story: null, pending_submitted_at: null,
  };
  let { error } = await db.from("tiles").update(full).eq("id", id);
  if (error && /pending_|column/.test(error.message)) {
    const safe = { ...full } as Record<string, unknown>;
    delete safe.pending_image_path; delete safe.pending_story; delete safe.pending_submitted_at;
    ({ error } = await db.from("tiles").update(safe).eq("id", id));
  }
  if (error) throw new Error(error.message);
  await db.from("moderation_log").insert({ tile_id: id, action: "removed" });
  await broadcastWallChange();
  revalidatePath("/admin");
  revalidatePath("/");
}

