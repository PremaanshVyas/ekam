"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";
import { reopenExpiredClaims } from "@/lib/expiry";

export async function claimTile(formData: FormData) {
  // Identity comes from the verified magic-link session — not a typed field.
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.email) redirect("/claim?autherror=1");

  const email = user.email.toLowerCase();
  const name = String(formData.get("name") || "").trim() || user.email.split("@")[0];
  const loc = String(formData.get("loc") || "").trim();

  const db = supabaseAdmin();
  const { data: canvas } = await db.from("canvases").select("id").eq("slug", CANVAS_SLUG).maybeSingle();
  if (!canvas) redirect("/claim?error=nocanvas");

  // Free up any tiles whose 24h claim lapsed.
  await reopenExpiredClaims();

  const jar = await cookies();

  // One tile per verified person.
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

  const { data: open } = await db
    .from("tiles").select("id").eq("canvas_id", canvas.id).eq("status", "open").limit(80);
  if (!open || open.length === 0) redirect("/claim?error=full");

  // Shuffle for fair random assignment.
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }

  // Concurrency-safe: the `.eq("status","open")` condition + `.select()` row count
  // guarantees only ONE claimer wins a tile; if we lose the race, try the next one.
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  let claimedId: string | null = null;
  for (const cand of open) {
    const { data: rows } = await db
      .from("tiles")
      .update({
        status: "claimed", artist_name: name, artist_email: email,
        artist_location: loc || null, claimed_at: new Date().toISOString(), claim_expires_at: expires,
      })
      .eq("id", cand.id)
      .eq("status", "open")
      .select("id");
    if (rows && rows.length) { claimedId = cand.id; break; }
  }
  if (!claimedId) redirect("/claim?error=full");

  jar.set("tile", claimedId, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 });
  redirect("/paint");
}
