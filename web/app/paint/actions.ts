"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

export async function submitTile(tileId: string, dataUrl: string, story: string) {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("bad image");
  const bytes = Buffer.from(base64, "base64");

  const db = supabaseAdmin();
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
  redirect("/?submitted=1");
}
