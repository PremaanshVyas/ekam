import { supabaseAdmin } from "@/lib/supabase";

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
  await db.from("moderation_log").insert({ tile_id: id, action: "approved", reason: via === "ai" ? "auto approved by AI screen" : null });
}
