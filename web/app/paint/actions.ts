"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";

export type SubmitMode = "new" | "edit-pending" | "edit-published";

export async function submitTile(tileId: string, dataUrl: string, story: string): Promise<{ ok: true; mode: SubmitMode }> {
  // Must be signed in and own this tile.
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.email) throw new Error("not signed in");
  const email = user.email.toLowerCase();

  const db = supabaseAdmin();
  const { data: tile } = await db
    .from("tiles").select("artist_email, status").eq("id", tileId).maybeSingle();
  if (!tile || tile.artist_email !== email) throw new Error("this isn't your tile");
  if (!["claimed", "pending", "published"].includes(tile.status)) throw new Error("this tile can't be edited right now");

  // Validate the image (our 512px PNG; cap size as an abuse guard).
  if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("invalid image");
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("bad image");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > 2_000_000) throw new Error("image too large");
  const cleanStory = story.slice(0, 140);

  if (tile.status === "published") {
    // Editing a LIVE tile → stage as a pending edit; the published tile stays on the canvas.
    const path = `${tileId}-${Date.now()}.png`;
    const up = await db.storage.from("tiles").upload(path, bytes, { contentType: "image/png", upsert: true });
    if (up.error) throw new Error(up.error.message);
    const { error } = await db.from("tiles").update({
      pending_image_path: path, pending_story: cleanStory, pending_submitted_at: new Date().toISOString(),
    }).eq("id", tileId).eq("status", "published");
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return { ok: true, mode: "edit-published" };
  }

  // New tile, or edit of an un-approved one → goes (back) into the queue.
  // Versioned filename so a re-submit never collides with a cached copy of the old image
  // (browser + Supabase CDN cache by URL — reusing the path would show the stale image).
  const path = `${tileId}-${Date.now()}.png`;
  const up = await db.storage.from("tiles").upload(path, bytes, { contentType: "image/png", upsert: true });
  if (up.error) throw new Error(up.error.message);
  const { error } = await db.from("tiles").update({
    status: "pending", story: cleanStory, image_path: path,
  }).eq("id", tileId).in("status", ["claimed", "pending"]);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { ok: true, mode: tile.status === "claimed" ? "new" : "edit-pending" };
}
