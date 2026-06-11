"use server";

import { supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";
import { broadcastWallChange } from "@/lib/broadcast";
import { notify } from "@/lib/notify";

export type ClaimResult =
  | { ok: true; tileId: string; x: number; y: number }
  | { ok: false; error: "auth" | "nocanvas" | "have-tile" | "taken"; x?: number; y?: number };

// Claim the SPECIFIC open tile the user clicked (idx → x,y), concurrency-safe.
// One tile per verified email. Identity comes from the magic-code session.
export async function claimTileAt(idx: number): Promise<ClaimResult> {
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.email) return { ok: false, error: "auth" };
  const email = user.email.toLowerCase();

  const db = supabaseAdmin();
  const { data: canvas } = await db.from("canvases").select("id, grid_cols, grid_rows").eq("slug", CANVAS_SLUG).maybeSingle();
  if (!canvas) return { ok: false, error: "nocanvas" };
  const cols = canvas.grid_cols ?? 24, gridRows = canvas.grid_rows ?? 24;
  if (!Number.isInteger(idx) || idx < 0 || idx >= cols * gridRows) return { ok: false, error: "taken" };
  const x = idx % cols, y = Math.floor(idx / cols);

  // One tile per person — if they already have one, send them to it.
  const { data: existing } = await db
    .from("tiles").select("id, x, y").eq("canvas_id", canvas.id).eq("artist_email", email)
    .in("status", ["claimed", "pending", "published"]).limit(1).maybeSingle();
  if (existing) return { ok: false, error: "have-tile", x: existing.x, y: existing.y };

  const name = user.email.split("@")[0];
  // Concurrency-safe: only succeeds if the tile is still open.
  const { data: rows } = await db
    .from("tiles")
    .update({ status: "claimed", artist_name: name, artist_email: email, claimed_at: new Date().toISOString() })
    .eq("canvas_id", canvas.id).eq("x", x).eq("y", y).eq("status", "open")
    .select("id");
  if (!rows || rows.length === 0) return { ok: false, error: "taken", x, y };
  await notify(db, email, "claim", `Tile R${String(y + 1).padStart(2, "0")}·C${String(x + 1).padStart(2, "0")} is yours ✦`, "Paint what home looks like and submit when you're ready.");
  await broadcastWallChange();
  return { ok: true, tileId: rows[0].id, x, y };
}
