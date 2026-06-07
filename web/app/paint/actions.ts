"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";

export async function submitTile(tileId: string, dataUrl: string, story: string) {
  // Must be signed in, and must own this exact claimed tile.
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.email) throw new Error("not signed in");

  const db = supabaseAdmin();
  const { data: tile } = await db
    .from("tiles").select("artist_email, status").eq("id", tileId).maybeSingle();
  if (!tile || tile.status !== "claimed" || tile.artist_email !== user.email.toLowerCase()) {
    throw new Error("this isn't your tile to submit");
  }

  // Validate the image payload (must be our 512px PNG; cap size as an abuse guard).
  if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("invalid image");
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("bad image");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > 2_000_000) throw new Error("image too large");

  const path = `${tileId}.png`;
  const up = await db.storage.from("tiles").upload(path, bytes, { contentType: "image/png", upsert: true });
  if (up.error) throw new Error(up.error.message);

  const { error } = await db
    .from("tiles")
    .update({ status: "pending", story: story.slice(0, 140), image_path: path })
    .eq("id", tileId)
    .eq("status", "claimed");
  if (error) throw new Error(error.message);

  (await cookies()).delete("tile");
  revalidatePath("/");
  return { ok: true as const };
}
