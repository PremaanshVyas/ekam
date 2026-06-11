import { supabaseAdmin } from "./supabase";
import { notify } from "./notify";
import { broadcastWallChange } from "./broadcast";

const lbl = (x: number, y: number) => `R${String(y + 1).padStart(2, "0")}·C${String(x + 1).padStart(2, "0")}`;

// Soft per-instance throttle: the sweep runs lazily on canvas loads, no point
// hammering the same two queries on every request. The cron passes force=true.
let lastSweep = 0;

/* 48 hour claim window sweep:
 *  - reopen lapsed claims (claimed tiles whose window passed without a submission;
 *    every submission resets the window in submitTile, so active painters are safe)
 *  - warn tiles entering their last 12 hours (once, deduped via expiry_warned_at)
 * Claims with claim_expires_at NULL (pre-0008 grandfathered) are never touched. */
export async function sweepClaimWindows(force = false): Promise<{ reopened: number; warned: number }> {
  if (!force && Date.now() - lastSweep < 5 * 60 * 1000) return { reopened: 0, warned: 0 };
  lastSweep = Date.now();

  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();
  let reopened = 0, warned = 0;

  try {
    const { data: lapsed } = await db.from("tiles")
      .select("id, x, y, artist_email")
      .eq("status", "claimed")
      .not("claim_expires_at", "is", null)
      .lt("claim_expires_at", nowIso);
    for (const t of lapsed ?? []) {
      // concurrency-safe: only flips if still claimed (a submit in flight wins)
      const reset: Record<string, unknown> = {
        status: "open", artist_name: null, artist_email: null, artist_location: null,
        story: null, image_path: null, thumb_path: null,
        pending_image_path: null, pending_story: null, pending_submitted_at: null,
        draft_image_path: null, draft_story: null, draft_updated_at: null,
        ai_verdict: null, ai_reason: null, ai_checked_at: null, review_requested_at: null,
        claimed_at: null, claim_expires_at: null,
      };
      const flip = (payload: Record<string, unknown>) =>
        db.from("tiles").update(payload).eq("id", t.id).eq("status", "claimed").select("id");
      let { data: rows, error: flipErr } = await flip({ ...reset, expiry_warned_at: null });
      if (flipErr) ({ data: rows } = await flip(reset)); // expiry_warned_at may not exist before 0008
      if (rows && rows.length) {
        reopened++;
        await notify(db, t.artist_email, "expired", `Tile ${lbl(t.x, t.y)} reopened`,
          "The 48 hour painting window passed without a submission, so the tile went back to the wall. You can claim another open tile anytime.");
        try { await db.from("moderation_log").insert({ tile_id: t.id, action: "expired", reason: "48h claim window lapsed without a submission" }); } catch { /* log table optional */ }
      }
    }
  } catch { /* claim_expires_at may not exist before migration 0008 */ }

  try {
    const warnBefore = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const { data: closing } = await db.from("tiles")
      .select("id, x, y, artist_email, claim_expires_at")
      .eq("status", "claimed")
      .is("expiry_warned_at", null)
      .not("claim_expires_at", "is", null)
      .gt("claim_expires_at", nowIso)
      .lt("claim_expires_at", warnBefore);
    for (const t of closing ?? []) {
      // claim the warning slot first so two sweeps never double-notify
      const { data: rows } = await db.from("tiles").update({ expiry_warned_at: nowIso })
        .eq("id", t.id).is("expiry_warned_at", null).select("id");
      if (rows && rows.length) {
        warned++;
        const hrs = Math.max(1, Math.round((Date.parse(t.claim_expires_at) - Date.now()) / 3600000));
        await notify(db, t.artist_email, "expiring", `${hrs} ${hrs === 1 ? "hour" : "hours"} left on tile ${lbl(t.x, t.y)}`,
          "Submit your painting before the window closes to keep your tile. Drafts don't count, only a submission does.");
      }
    }
  } catch { /* expiry_warned_at may not exist before migration 0008 */ }

  if (reopened) await broadcastWallChange();
  return { reopened, warned };
}

// kept for older imports (the cron route used this name)
export async function reopenExpiredClaims(): Promise<number> {
  return (await sweepClaimWindows(true)).reopened;
}
