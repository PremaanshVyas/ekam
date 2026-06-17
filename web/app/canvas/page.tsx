import { after } from "next/server";
import Explorer from "@/components/Explorer";
import { supabaseAnon, supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";
import { identityOf, ownerOr } from "@/lib/identity";
import { findMyTile } from "@/lib/tiles";
import type { RealTileInput } from "@/lib/realWall";
import { canvasClosesAt, canvasClosed } from "@/lib/deadline";
import { sweepClaimWindows } from "@/lib/expiry";

export const dynamic = "force-dynamic";
// submit's server action runs through this route — give the post-response AI screen room
export const maxDuration = 60;

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const artUrl = (p: string | null) => (p && !p.startsWith("#") ? `${SUPA}/storage/v1/object/public/tiles/${p}` : null);

type Row = {
  id: string; x: number; y: number; status: string; artist_name: string | null; artist_location: string | null;
  story: string | null; image_path: string | null; thumb_path: string | null; published_at: string | null;
};

export default async function CanvasPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const autoOpenMine = (await searchParams).mine === "1";

  let cols = 24, rows = 24;
  let tiles: RealTileInput[] = [];
  let claimed = 0;
  let email: string | null = null;
  let signedIn = false;
  let myTile = null;
  let loadError = false;
  let notifs: { id: string; kind: string; title: string; body: string | null; created_at: string; read_at: string | null }[] = [];
  let unread = 0;
  let published = 0;
  let finaleFrom: string | null = null, finaleTo: string | null = null;
  let closesAt: string | null = null;

  try {
    const auth = await createSupabaseServer();
    const db = supabaseAnon();
    // Parallel: session + canvas row (independent round trips).
    const [{ data: { user } }, { data: canvas }, closes] = await Promise.all([
      auth.auth.getUser(),
      db.from("canvases").select("id, grid_cols, grid_rows").eq("slug", CANVAS_SLUG).maybeSingle(),
      canvasClosesAt(db),
    ]);
    closesAt = closes;
    const me = identityOf(user);
    email = me?.email ?? null;
    signedIn = !!me;
    cols = canvas?.grid_cols ?? 24;
    rows = canvas?.grid_rows ?? 24;

    if (canvas) {
      // Parallel: the tile list + the signed-in person's tile.
      const [tilesRes, mt] = await Promise.all([
        db.from("public_tiles")
          .select("id, x, y, status, artist_name, artist_location, story, image_path, thumb_path, published_at")
          .eq("canvas_id", canvas.id),
        me ? findMyTile(supabaseAdmin(), canvas.id, me) : Promise.resolve(null),
      ]);

      // upvotes: aggregate counts + the viewer's own votes (server-only reads; emails stay private)
      const voteCount = new Map<string, number>();
      const myVotes = new Set<string>();
      try {
        const [allVotes, mine] = await Promise.all([
          supabaseAdmin().from("tile_votes").select("tile_id"),
          me ? supabaseAdmin().from("tile_votes").select("tile_id").or(ownerOr(me, "voter_user_id", "voter_email")) : Promise.resolve({ data: [] as { tile_id: string }[] }),
        ]);
        for (const v of allVotes.data ?? []) voteCount.set(v.tile_id, (voteCount.get(v.tile_id) ?? 0) + 1);
        for (const v of mine.data ?? []) myVotes.add(v.tile_id);
      } catch { /* migration 0007 not run yet */ }

      tiles = ((tilesRes.data as Row[]) ?? []).map((t) => {
        const isPub = t.status === "published";
        const ip = t.image_path;
        const img = isPub && ip ? (ip.startsWith("#") ? ip : `${SUPA}/storage/v1/object/public/tiles/${ip}`) : null;
        const thumb = isPub && t.thumb_path && !t.thumb_path.startsWith("#") ? `${SUPA}/storage/v1/object/public/tiles/${t.thumb_path}` : null;
        if (["claimed", "pending", "published"].includes(t.status)) claimed++;
        if (isPub) {
          published++;
          if (t.published_at) {
            if (!finaleFrom || t.published_at < finaleFrom) finaleFrom = t.published_at;
            if (!finaleTo || t.published_at > finaleTo) finaleTo = t.published_at;
          }
        }
        return { x: t.x, y: t.y, status: t.status, name: isPub ? t.artist_name : null, loc: isPub ? t.artist_location : null, story: isPub ? t.story : null, img, thumb, uuid: t.id, votes: voteCount.get(t.id) ?? 0, voted: myVotes.has(t.id) };
      });
      if (tilesRes.error) loadError = true;

      if (me) {
        try {
          const { data: nd } = await supabaseAdmin().from("notifications")
            .select("id, kind, title, body, created_at, read_at")
            .or(ownerOr(me)).order("created_at", { ascending: false }).limit(12);
          notifs = nd ?? [];
          unread = notifs.filter((n) => !n.read_at).length;
        } catch { /* migration 0006 not run yet */ }
      }

      if (mt) {
        // cache-bust the draft URL with its updated_at so a new device always pulls the latest
        const draftUrl = mt.draft_image_path ? `${artUrl(mt.draft_image_path)}?v=${encodeURIComponent(mt.draft_updated_at ?? "")}` : null;
        myTile = { id: mt.id, idx: mt.y * cols + mt.x, status: mt.status, name: mt.artist_name, artUrl: artUrl(mt.pending_image_path || mt.image_path), story: mt.pending_story || mt.story, draftUrl, draftStory: mt.draft_story ?? null, aiVerdict: mt.ai_verdict, aiReason: mt.ai_reason, expiresAt: mt.claim_expires_at };
      }
    } else {
      loadError = true;
    }
  } catch {
    // Render the shell with a retry pill rather than the hard error page —
    // a transient Supabase hiccup shouldn't kill the whole canvas.
    loadError = true;
  }

  // enforce the 48h windows opportunistically after the response (cron is the daily backstop)
  after(() => { sweepClaimWindows().catch(() => { /* best effort */ }); });

  // FINALE_FORCE is a local-only test knob (never set in prod): simulates deadline day
  const deadlinePassed = canvasClosed(closesAt) || process.env.FINALE_FORCE === "1";
  const complete = published >= cols * rows || deadlinePassed;
  return <Explorer cols={cols} total={cols * rows} tiles={tiles} claimed={claimed} email={email} signedIn={signedIn} myTile={myTile} autoOpenMine={autoOpenMine} loadError={loadError} notifs={notifs} unread={unread} complete={complete} published={published} finaleFrom={finaleFrom} finaleTo={finaleTo} closesAt={closesAt} deadlinePassed={deadlinePassed} />;
}
