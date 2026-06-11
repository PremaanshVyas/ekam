import { supabaseAdmin } from "@/lib/supabase";
import { broadcastWallChange } from "@/lib/broadcast";
import { notify } from "@/lib/notify";

const label = (x: number, y: number) => "R" + String(y + 1).padStart(2, "0") + "·C" + String(x + 1).padStart(2, "0");

// Core publish logic shared by the human admin action and the AI auto-approve path.
// Handles both cases: a brand-new pending tile, and a pending EDIT to a live tile.
export async function publishTile(db: ReturnType<typeof supabaseAdmin>, id: string, via: "admin" | "ai"): Promise<void> {
  const { data: tile } = await db.from("tiles").select("pending_image_path, pending_story, artist_email, x, y, review_requested_at").eq("id", id).maybeSingle()
    .then((r) => r.error ? db.from("tiles").select("pending_image_path, pending_story, artist_email, x, y").eq("id", id).maybeSingle() : r) as { data: { pending_image_path: string | null; pending_story: string | null; artist_email: string | null; x: number; y: number; review_requested_at?: string | null } | null };
  if (!tile) return;
  const wasRequested = !!tile.review_requested_at;

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
  await db.from("tiles").update({ review_requested_at: null }).eq("id", id); // best-effort (0006)
  await db.from("moderation_log").insert({ tile_id: id, action: via === "ai" ? "ai-approved" : "approved", reason: via === "ai" ? "auto approved by AI screen" : null });
  await notify(db, tile.artist_email,
    wasRequested || via === "admin" ? "mod-approved" : "live",
    `Your tile ${label(tile.x, tile.y)} is live ✦`,
    wasRequested ? "The moderator reviewed your tile and approved it. It's on the wall now." : "It cleared review and joined the wall. Share it from your tile panel.");
  await broadcastWallChange();
}

// AI auto-reject: kind by design. A new tile is RETURNED to its artist (status back to
// claimed, painting kept) so they can fix and resubmit — never un-claimed by a machine.
// A rejected edit to a live tile keeps its pending image (hidden from the queue) so the
// artist can still request a human review; the live tile stays untouched.
export async function aiRejectTile(db: ReturnType<typeof supabaseAdmin>, id: string, reason: string): Promise<void> {
  const { data: tile } = await db.from("tiles").select("status, pending_image_path, artist_email, x, y").eq("id", id).maybeSingle();
  if (!tile) return;
  if (!tile.pending_image_path && tile.status === "pending") {
    await db.from("tiles").update({ status: "claimed" }).eq("id", id).eq("status", "pending");
  }
  await db.from("moderation_log").insert({ tile_id: id, action: "ai-rejected", reason: reason.slice(0, 300) });
  await notify(db, tile.artist_email, "returned",
    `Your tile ${label(tile.x, tile.y)} was returned by review`,
    `${reason} You can edit it and resubmit, or request a human review from your tile panel.`);
  await broadcastWallChange();
}
