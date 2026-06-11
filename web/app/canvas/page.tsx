import Explorer from "@/components/Explorer";
import { supabaseAnon, supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";
import { findMyTile } from "@/lib/tiles";
import type { RealTileInput } from "@/lib/realWall";

export const dynamic = "force-dynamic";
// submit's server action runs through this route — give the post-response AI screen room
export const maxDuration = 60;

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const artUrl = (p: string | null) => (p && !p.startsWith("#") ? `${SUPA}/storage/v1/object/public/tiles/${p}` : null);

type Row = {
  x: number; y: number; status: string; artist_name: string | null; artist_location: string | null;
  story: string | null; image_path: string | null; thumb_path: string | null;
};

export default async function CanvasPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const autoOpenMine = (await searchParams).mine === "1";

  let cols = 24, rows = 24;
  let tiles: RealTileInput[] = [];
  let claimed = 0;
  let email: string | null = null;
  let myTile = null;
  let loadError = false;
  let notifs: { id: string; kind: string; title: string; body: string | null; created_at: string; read_at: string | null }[] = [];
  let unread = 0;

  try {
    const auth = await createSupabaseServer();
    const db = supabaseAnon();
    // Parallel: session + canvas row (independent round trips).
    const [{ data: { user } }, { data: canvas }] = await Promise.all([
      auth.auth.getUser(),
      db.from("canvases").select("id, grid_cols, grid_rows").eq("slug", CANVAS_SLUG).maybeSingle(),
    ]);
    email = user?.email ?? null;
    cols = canvas?.grid_cols ?? 24;
    rows = canvas?.grid_rows ?? 24;

    if (canvas) {
      // Parallel: the tile list + the signed-in person's tile.
      const [tilesRes, mt] = await Promise.all([
        db.from("public_tiles")
          .select("x, y, status, artist_name, artist_location, story, image_path, thumb_path")
          .eq("canvas_id", canvas.id),
        email ? findMyTile(supabaseAdmin(), canvas.id, email) : Promise.resolve(null),
      ]);

      tiles = ((tilesRes.data as Row[]) ?? []).map((t) => {
        const isPub = t.status === "published";
        const ip = t.image_path;
        const img = isPub && ip ? (ip.startsWith("#") ? ip : `${SUPA}/storage/v1/object/public/tiles/${ip}`) : null;
        const thumb = isPub && t.thumb_path && !t.thumb_path.startsWith("#") ? `${SUPA}/storage/v1/object/public/tiles/${t.thumb_path}` : null;
        if (["claimed", "pending", "published"].includes(t.status)) claimed++;
        return { x: t.x, y: t.y, status: t.status, name: isPub ? t.artist_name : null, loc: isPub ? t.artist_location : null, story: isPub ? t.story : null, img, thumb };
      });
      if (tilesRes.error) loadError = true;

      if (email) {
        try {
          const { data: nd } = await supabaseAdmin().from("notifications")
            .select("id, kind, title, body, created_at, read_at")
            .eq("artist_email", email.toLowerCase()).order("created_at", { ascending: false }).limit(12);
          notifs = nd ?? [];
          unread = notifs.filter((n) => !n.read_at).length;
        } catch { /* migration 0006 not run yet */ }
      }

      if (mt) {
        // cache-bust the draft URL with its updated_at so a new device always pulls the latest
        const draftUrl = mt.draft_image_path ? `${artUrl(mt.draft_image_path)}?v=${encodeURIComponent(mt.draft_updated_at ?? "")}` : null;
        myTile = { id: mt.id, idx: mt.y * cols + mt.x, status: mt.status, name: mt.artist_name, artUrl: artUrl(mt.pending_image_path || mt.image_path), story: mt.pending_story || mt.story, draftUrl, draftStory: mt.draft_story ?? null, aiVerdict: mt.ai_verdict, aiReason: mt.ai_reason };
      }
    } else {
      loadError = true;
    }
  } catch {
    // Render the shell with a retry pill rather than the hard error page —
    // a transient Supabase hiccup shouldn't kill the whole canvas.
    loadError = true;
  }

  return <Explorer cols={cols} total={cols * rows} tiles={tiles} claimed={claimed} email={email} myTile={myTile} autoOpenMine={autoOpenMine} loadError={loadError} notifs={notifs} unread={unread} />;
}
