import { supabaseAdmin } from "@/lib/supabase";
import { broadcastWallChange } from "@/lib/broadcast";

// Core publish logic shared by the human admin action and the AI auto-approve path.
// Handles both cases: a brand-new pending tile, and a pending EDIT to a live tile.
export async function publishTile(db: ReturnType<typeof supabaseAdmin>, id: string, via: "admin" | "ai"): Promise<void> {
  const { data: tile } = await db.from("tiles").select("pending_image_path, pending_story").eq("id", id).maybeSingle();
  if (!tile) return;

  if (tile.pending_image_path) {
    // Promote the pending edit to live. The submit pipeline uploads `<image>.thumb.png`
    // beside every image; verify the thumb actually exists before pointing at it.
    const thumbPath = tile.pending_image_path.replace(/\.png$/, ".thumb.png");
    const probe = await db.storage.from("tiles").download(thumbPath);
    await db.from("tiles").update({
      image_path: tile.pending_image_path,
      thumb_path: probe.error ? null : thumbPath,
      story: tile.pending_story,
      pending_image_path: null, pending_story: null, pending_submitted_at: null,
      published_at: new Date().toISOString(),
    }).eq("id", id);
  } else {
    await db.from("tiles").update({ status: "published", published_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
  }
  await db.from("moderation_log").insert({ tile_id: id, action: via === "ai" ? "ai-approved" : "approved", reason: via === "ai" ? "auto approved by AI screen" : null });
  await broadcastWallChange();
}

// AI auto-reject: kind by design. A new tile is RETURNED to its artist (status back to
// claimed, painting kept) so they can fix and resubmit — never un-claimed by a machine.
// A rejected edit to a live tile is dropped; the live tile stays untouched.
export async function aiRejectTile(db: ReturnType<typeof supabaseAdmin>, id: string, reason: string): Promise<void> {
  const { data: tile } = await db.from("tiles").select("status, pending_image_path").eq("id", id).maybeSingle();
  if (!tile) return;
  if (tile.pending_image_path) {
    await db.from("tiles").update({ pending_image_path: null, pending_story: null, pending_submitted_at: null }).eq("id", id);
  } else if (tile.status === "pending") {
    await db.from("tiles").update({ status: "claimed" }).eq("id", id).eq("status", "pending");
  }
  await db.from("moderation_log").insert({ tile_id: id, action: "ai-rejected", reason: reason.slice(0, 300) });
  await broadcastWallChange();
}
