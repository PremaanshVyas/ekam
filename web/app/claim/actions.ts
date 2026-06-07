"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";

export async function claimTile(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const loc = String(formData.get("loc") || "").trim();
  if (!name || !email) redirect("/claim?error=missing");

  const db = supabaseAdmin();
  const { data: canvas } = await db.from("canvases").select("id").eq("slug", CANVAS_SLUG).maybeSingle();
  if (!canvas) redirect("/claim?error=nocanvas");

  const jar = await cookies();

  // One active claim per email: reuse an existing claimed/pending tile.
  const { data: existing } = await db
    .from("tiles")
    .select("id, status")
    .eq("canvas_id", canvas.id)
    .eq("artist_email", email)
    .in("status", ["claimed", "pending", "published"])
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.status === "published") redirect("/claim?error=already");
    jar.set("tile", existing.id, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 });
    redirect("/paint");
  }

  // Pick a random open tile.
  const { data: open } = await db
    .from("tiles").select("id").eq("canvas_id", canvas.id).eq("status", "open").limit(50);
  if (!open || open.length === 0) redirect("/claim?error=full");

  const pick = open[Math.floor(Math.random() * open.length)];
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const { error } = await db
    .from("tiles")
    .update({
      status: "claimed", artist_name: name, artist_email: email,
      artist_location: loc || null, claimed_at: new Date().toISOString(), claim_expires_at: expires,
    })
    .eq("id", pick.id)
    .eq("status", "open");
  if (error) redirect("/claim?error=fail");

  jar.set("tile", pick.id, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 });
  redirect("/paint");
}
