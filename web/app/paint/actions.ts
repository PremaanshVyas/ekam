"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";

export type SubmitMode = "new" | "edit-pending" | "edit-published";

// Decode + validate a PNG data URL: real base64, real PNG signature, capped size.
function pngBytes(dataUrl: string, maxBytes: number): Buffer | null {
  if (!dataUrl.startsWith("data:image/png;base64,")) return null;
  const b64 = dataUrl.split(",")[1];
  if (!b64) return null;
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length > maxBytes || bytes.length < 8) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;
  return bytes;
}

async function ownTile(tileId: string) {
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  const db = supabaseAdmin();
  const { data: tile } = await db.from("tiles").select("artist_email, status").eq("id", tileId).maybeSingle();
  if (!tile || tile.artist_email !== email) return null;
  if (!["claimed", "pending", "published"].includes(tile.status)) return null;
  return { db, tile, email };
}

export async function submitTile(
  tileId: string, dataUrl: string, thumbUrl: string | null, name: string, story: string,
): Promise<{ ok: true; mode: SubmitMode }> {
  const owned = await ownTile(tileId);
  if (!owned) throw new Error("this isn't your tile");
  const { db, tile } = owned;

  const bytes = pngBytes(dataUrl, 5_000_000);
  if (!bytes) throw new Error("invalid image");
  const thumbBytes = thumbUrl ? pngBytes(thumbUrl, 300_000) : null;

  const cleanStory = story.slice(0, 140);
  const cleanName = name.trim().slice(0, 40); // the display name the artist chose, replaces the email-derived default

  // Versioned filenames so a re-submit never collides with a cached copy of the old
  // image (browser + Supabase CDN cache by URL). The thumb shares the timestamp so
  // approve can derive it from the image path without a schema change.
  const ts = Date.now();
  const path = `${tileId}-${ts}.png`;
  const thumbPath = `${tileId}-${ts}.thumb.png`;

  const up = await db.storage.from("tiles").upload(path, bytes, { contentType: "image/png", upsert: true });
  if (up.error) throw new Error(up.error.message);
  if (thumbBytes) await db.storage.from("tiles").upload(thumbPath, thumbBytes, { contentType: "image/png", upsert: true });

  if (tile.status === "published") {
    // Editing a LIVE tile → stage as a pending edit; the published tile stays on the canvas.
    const { error } = await db.from("tiles").update({
      pending_image_path: path, pending_story: cleanStory, pending_submitted_at: new Date().toISOString(),
      ...(cleanName ? { artist_name: cleanName } : {}),
    }).eq("id", tileId).eq("status", "published");
    if (error) throw new Error(error.message);
    await clearDraft(db, tileId);
    revalidatePath("/admin");
    return { ok: true, mode: "edit-published" };
  }

  // New tile, or edit of an un-approved one → goes (back) into the queue.
  const { error } = await db.from("tiles").update({
    status: "pending", story: cleanStory, image_path: path,
    ...(thumbBytes ? { thumb_path: thumbPath } : {}),
    ...(cleanName ? { artist_name: cleanName } : {}),
  }).eq("id", tileId).in("status", ["claimed", "pending"]);
  if (error) throw new Error(error.message);
  await clearDraft(db, tileId);
  revalidatePath("/admin");
  return { ok: true, mode: tile.status === "claimed" ? "new" : "edit-pending" };
}

// Drop the autosave draft once there's a real submission. Best-effort: if the draft_*
// columns don't exist yet (migration 0004 not run) the update errors and we ignore it.
async function clearDraft(db: ReturnType<typeof supabaseAdmin>, tileId: string) {
  await db.from("tiles").update({ draft_image_path: null, draft_story: null, draft_updated_at: null }).eq("id", tileId);
}

// Autosave the in-progress canvas so the artist can resume on another device.
// Private-by-obscurity (unguessable path, returned only to the owner); never public.
export async function saveDraft(tileId: string, dataUrl: string, story: string): Promise<{ ok: boolean; updatedAt?: string }> {
  const owned = await ownTile(tileId);
  if (!owned) return { ok: false };
  const { db } = owned;

  const bytes = pngBytes(dataUrl, 5_000_000);
  if (!bytes) return { ok: false };

  const path = `draft-${tileId}.png`;
  const up = await db.storage.from("tiles").upload(path, bytes, { contentType: "image/png", upsert: true });
  if (up.error) return { ok: false };

  const updatedAt = new Date().toISOString();
  const { error } = await db.from("tiles")
    .update({ draft_image_path: path, draft_story: story.slice(0, 140), draft_updated_at: updatedAt })
    .eq("id", tileId);
  if (error) return { ok: false }; // draft_* columns missing → migration 0004 not run yet
  return { ok: true, updatedAt };
}
