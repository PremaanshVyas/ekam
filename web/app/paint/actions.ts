"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";
import { moderateTile } from "@/lib/moderate";
import { canvasClosesAt, canvasClosed, claimWindowEnd } from "@/lib/deadline";

export type SubmitMode = "new" | "edit-pending" | "edit-published";

// Read + validate an uploaded PNG. The image arrives as binary (a Blob), NOT a base64
// data URL: a 1024² PNG is ~1MB and React rejects megabyte string args to a Server
// Action ("Maximum array nesting exceeded"). Binary is streamed as multipart instead.
async function pngFromBlob(blob: Blob | null, maxBytes: number): Promise<Buffer | null> {
  if (!blob || typeof blob.arrayBuffer !== "function") return null;
  const bytes = Buffer.from(await blob.arrayBuffer());
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
  tileId: string, image: Blob, thumb: Blob | null, name: string, story: string,
): Promise<{ ok: true; mode: SubmitMode } | { ok: false; error: "closed" }> {
  const owned = await ownTile(tileId);
  if (!owned) throw new Error("this isn't your tile");
  const { db, tile } = owned;

  const closesAt = await canvasClosesAt(db);
  if (canvasClosed(closesAt) || process.env.FINALE_FORCE === "1") return { ok: false, error: "closed" };

  const bytes = await pngFromBlob(image, 5_000_000);
  if (!bytes) throw new Error("invalid image");
  const thumbBytes = thumb ? await pngFromBlob(thumb, 300_000) : null;

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
  // only record the thumb if its upload actually succeeded — a thumb_path pointing at
  // a missing object makes every wall load 400 before falling back to the full PNG
  let thumbOk = false;
  if (thumbBytes) {
    const tu = await db.storage.from("tiles").upload(thumbPath, thumbBytes, { contentType: "image/png", upsert: true });
    thumbOk = !tu.error;
  }

  // fresh review cycle: clear the previous verdict so the client can watch this one land
  await db.from("tiles").update({ ai_verdict: null, ai_reason: null, ai_checked_at: null, review_requested_at: null }).eq("id", tileId);

  if (tile.status === "published") {
    // Editing a LIVE tile → stage as a pending edit; the published tile stays on the canvas.
    const { error } = await db.from("tiles").update({
      pending_image_path: path, pending_story: cleanStory, pending_submitted_at: new Date().toISOString(),
      ...(cleanName ? { artist_name: cleanName } : {}),
    }).eq("id", tileId).eq("status", "published");
    if (error) throw new Error(error.message);
    await clearDraft(db, tileId);
    after(() => moderateTile(tileId)); // AI screen runs after the response is sent
    revalidatePath("/admin");
    return { ok: true, mode: "edit-published" };
  }

  // New tile, or edit of an un-approved one → goes (back) into the queue.
  // Submitting resets the 48h window: the tile stays yours while you keep trying,
  // even if review returns it. Falls back without the 0008 columns.
  const payload = {
    status: "pending", story: cleanStory, image_path: path,
    ...(thumbOk ? { thumb_path: thumbPath } : {}),
    ...(cleanName ? { artist_name: cleanName } : {}),
  };
  const submitQ = (extra: Record<string, unknown>) =>
    db.from("tiles").update({ ...payload, ...extra }).eq("id", tileId).in("status", ["claimed", "pending"]);
  let { error } = await submitQ({ claim_expires_at: claimWindowEnd(closesAt), expiry_warned_at: null });
  if (error) ({ error } = await submitQ({}));
  if (error) throw new Error(error.message);
  await clearDraft(db, tileId);
  after(() => moderateTile(tileId)); // AI screen runs after the response is sent
  revalidatePath("/admin");
  return { ok: true, mode: tile.status === "claimed" ? "new" : "edit-pending" };
}

export type ReviewState = { state: "checking" | "live" | "returned" | "escalated" | "requested" | "closed"; reason: string | null };

// The artist's live view of their submission's review. Polled by the client after submit.
export async function reviewStatus(tileId: string): Promise<ReviewState> {
  const owned = await ownTile(tileId);
  if (!owned) return { state: "checking", reason: null };
  const { db } = owned;
  const { data: t } = await db.from("tiles")
    .select("status, pending_image_path, ai_verdict, ai_reason, ai_checked_at, review_requested_at")
    .eq("id", tileId).maybeSingle();
  if (!t) return { state: "checking", reason: null };
  if (t.review_requested_at) return { state: "requested", reason: t.ai_reason ?? null };
  if (!t.ai_checked_at) return { state: "checking", reason: null };
  const v = t.ai_verdict;
  if (v === "approve") {
    if (t.status === "published" && !t.pending_image_path) return { state: "live", reason: null };
    // verdict stored but the publish is still in flight (thumb check, notify, broadcast)
    // — keep the client polling instead of mislabeling this gap as "needs a human"
    if (process.env.AI_AUTO !== "0") return { state: "checking", reason: null };
    return { state: "escalated", reason: null }; // label-only mode: a human publishes
  }
  if (v === "reject") return { state: "returned", reason: t.ai_reason ?? null };
  // review verdict, or an AI error → it's sitting with the human moderator
  return { state: "escalated", reason: v === "review" ? (t.ai_reason ?? null) : null };
}

// The artist disputes an AI return → put it in front of the human moderator.
export async function requestManualReview(tileId: string): Promise<{ ok: boolean }> {
  const owned = await ownTile(tileId);
  if (!owned) return { ok: false };
  const { db, tile } = owned;
  const { data: t } = await db.from("tiles").select("status, pending_image_path, ai_verdict").eq("id", tileId).maybeSingle();
  if (!t || t.ai_verdict !== "reject") return { ok: false };
  if (!t.pending_image_path && t.status === "claimed") {
    await db.from("tiles").update({ status: "pending" }).eq("id", tileId).eq("status", "claimed");
  }
  const { error } = await db.from("tiles").update({ review_requested_at: new Date().toISOString() }).eq("id", tileId);
  if (error) return { ok: false }; // migration 0006 not run yet
  await db.from("moderation_log").insert({ tile_id: tileId, action: "review-requested", reason: `artist (${tile.artist_email}) asked for a human review` });
  revalidatePath("/admin");
  return { ok: true };
}

// Drop the autosave draft once there's a real submission. Best-effort: if the draft_*
// columns don't exist yet (migration 0004 not run) the update errors and we ignore it.
async function clearDraft(db: ReturnType<typeof supabaseAdmin>, tileId: string) {
  await db.from("tiles").update({ draft_image_path: null, draft_story: null, draft_updated_at: null }).eq("id", tileId);
}

// Autosave the in-progress canvas so the artist can resume on another device.
// Private-by-obscurity (unguessable path, returned only to the owner); never public.
export async function saveDraft(tileId: string, image: Blob, story: string): Promise<{ ok: boolean; updatedAt?: string }> {
  const owned = await ownTile(tileId);
  if (!owned) return { ok: false };
  const { db } = owned;

  const bytes = await pngFromBlob(image, 5_000_000);
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
