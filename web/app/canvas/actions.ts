"use server";

import { supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";
import { currentIdentity, ownerOr, owns } from "@/lib/identity";
import { broadcastWallChange } from "@/lib/broadcast";
import { notify } from "@/lib/notify";
import { canvasClosesAt, canvasClosed, graceWindowEnd } from "@/lib/deadline";

export type ClaimResult =
  | { ok: true; tileId: string; x: number; y: number }
  | { ok: false; error: "auth" | "nocanvas" | "have-tile" | "taken" | "closed"; x?: number; y?: number };

// Claim the SPECIFIC open tile the user clicked (idx → x,y), concurrency-safe.
// One tile per identity. Identity is the session's auth user id (anonymous or email) — no
// email is required to claim; the silent anonymous session is created on the client first.
export async function claimTileAt(idx: number, displayName?: string): Promise<ClaimResult> {
  const me = await currentIdentity();
  if (!me) return { ok: false, error: "auth" };

  const db = supabaseAdmin();
  const { data: canvas } = await db.from("canvases").select("id, grid_cols, grid_rows").eq("slug", CANVAS_SLUG).maybeSingle();
  if (!canvas) return { ok: false, error: "nocanvas" };
  const closesAt = await canvasClosesAt(db);
  if (canvasClosed(closesAt) || process.env.FINALE_FORCE === "1") return { ok: false, error: "closed" };
  const cols = canvas.grid_cols ?? 24, gridRows = canvas.grid_rows ?? 24;
  if (!Number.isInteger(idx) || idx < 0 || idx >= cols * gridRows) return { ok: false, error: "taken" };
  const x = idx % cols, y = Math.floor(idx / cols);

  // One tile per person — if they already have one (this device, or an email they used
  // before), send them to it.
  const { data: existing } = await db
    .from("tiles").select("id, x, y").eq("canvas_id", canvas.id).or(ownerOr(me))
    .in("status", ["claimed", "pending", "published"]).limit(1).maybeSingle();
  if (existing) return { ok: false, error: "have-tile", x: existing.x, y: existing.y };

  // The display name is captured here at claim time (so a held-but-unpainted tile still
  // shows who has it in admin). Anonymous painters typed it in the claim panel; for an
  // email session fall back to the email local part if they left it blank.
  const name = (displayName ?? "").trim().slice(0, 40) || (me.email ? me.email.split("@")[0] : null);
  // Concurrency-safe: only succeeds if the tile is still open. A just-claimed tile gets a
  // SHORT grace hold (1h); the first painted stroke promotes it to the full 48h window.
  // Falls back without the 0008 columns if that SQL hasn't run.
  const base: Record<string, unknown> = {
    status: "claimed", artist_user_id: me.userId, artist_name: name, claimed_at: new Date().toISOString(),
    ...(me.email ? { artist_email: me.email } : {}),
  };
  const claimQ = (payload: Record<string, unknown>) => db.from("tiles").update(payload)
    .eq("canvas_id", canvas.id).eq("x", x).eq("y", y).eq("status", "open").select("id");
  const claimFirst = await claimQ({ ...base, claim_expires_at: graceWindowEnd(closesAt), expiry_warned_at: null });
  let rows = claimFirst.data;
  if (claimFirst.error) rows = (await claimQ(base)).data;
  if (!rows || rows.length === 0) return { ok: false, error: "taken", x, y };
  await notify(db, { email: me.email, userId: me.userId }, "claim", `Tile R${String(y + 1).padStart(2, "0")}·C${String(x + 1).padStart(2, "0")} is yours ✦`, "Make your first stroke within the hour to keep it. Once you start painting it's yours for 48 hours to finish and submit.");
  await broadcastWallChange();
  return { ok: true, tileId: rows[0].id, x, y };
}

export type VoteResult = { ok: boolean; voted?: boolean; count?: number; error?: "auth" | "own" | "unavailable" };

// Upvote toggle: one vote per published tile per identity, never your own tile. Works for
// anonymous and email sessions alike (keyed on the auth user id).
export async function toggleVote(tileId: string): Promise<VoteResult> {
  const me = await currentIdentity();
  if (!me) return { ok: false, error: "auth" };

  const db = supabaseAdmin();
  const { data: tile } = await db.from("tiles").select("id, status, artist_email, artist_user_id, artist_name, x, y").eq("id", tileId).maybeSingle();
  if (!tile || tile.status !== "published") return { ok: false, error: "unavailable" };
  if (owns(me, tile)) return { ok: false, error: "own" };

  const { data: mine, error: selErr } = await db.from("tile_votes").select("tile_id").eq("tile_id", tileId).eq("voter_user_id", me.userId).maybeSingle();
  if (selErr) return { ok: false, error: "unavailable" }; // migration 0007/0010 not run yet
  let voted: boolean;
  if (mine) {
    await db.from("tile_votes").delete().eq("tile_id", tileId).eq("voter_user_id", me.userId);
    voted = false;
  } else {
    await db.from("tile_votes").insert({ tile_id: tileId, voter_user_id: me.userId, ...(me.email ? { voter_email: me.email } : {}) });
    voted = true;
  }
  const { count } = await db.from("tile_votes").select("tile_id", { count: "exact", head: true }).eq("tile_id", tileId);

  // first time this tile takes the lead → one congratulations to its artist
  if (voted) {
    try {
      const { data: counts } = await db.from("tile_votes").select("tile_id");
      const tally = new Map<string, number>();
      for (const r of counts ?? []) tally.set(r.tile_id, (tally.get(r.tile_id) ?? 0) + 1);
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[0] === tileId && (tile.artist_user_id || tile.artist_email)) {
        let priorQ = db.from("notifications").select("id").eq("kind", "top").limit(1);
        priorQ = tile.artist_user_id ? priorQ.eq("artist_user_id", tile.artist_user_id) : priorQ.eq("artist_email", tile.artist_email as string);
        const { data: prior } = await priorQ.maybeSingle();
        if (!prior) {
          const lbl = `R${String(tile.y + 1).padStart(2, "0")}·C${String(tile.x + 1).padStart(2, "0")}`;
          await notify(db, { email: tile.artist_email, userId: tile.artist_user_id }, "top", `Your tile ${lbl} is the most loved on the wall ✦`, "It wears the golden frame on the canvas right now. Share it while it reigns.");
        }
      }
    } catch { /* best effort */ }
  }

  await broadcastWallChange();
  return { ok: true, voted, count: count ?? 0 };
}
