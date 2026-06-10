import Explorer from "@/components/Explorer";
import { supabaseAnon, supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";
import { findMyTile } from "@/lib/tiles";
import type { RealTileInput } from "@/lib/realWall";

export const dynamic = "force-dynamic";

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const artUrl = (p: string | null) => (p && !p.startsWith("#") ? `${SUPA}/storage/v1/object/public/tiles/${p}` : null);

export default async function CanvasPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const autoOpenMine = (await searchParams).mine === "1";
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  const email = user?.email ?? null;

  const db = supabaseAnon();
  const { data: canvas } = await db.from("canvases").select("id, grid_cols, grid_rows").eq("slug", CANVAS_SLUG).maybeSingle();
  const cols = canvas?.grid_cols ?? 24;
  const rows = canvas?.grid_rows ?? 24;
  const total = cols * rows;

  let tiles: RealTileInput[] = [];
  let claimed = 0;
  if (canvas) {
    const { data } = await db.from("public_tiles").select("x, y, status, artist_name, artist_location, story, image_path").eq("canvas_id", canvas.id);
    type Row = { x: number; y: number; status: string; artist_name: string | null; artist_location: string | null; story: string | null; image_path: string | null };
    tiles = ((data as Row[]) ?? []).map((t) => {
      const isPub = t.status === "published";
      const ip = t.image_path;
      const img = isPub && ip ? (ip.startsWith("#") ? ip : `${SUPA}/storage/v1/object/public/tiles/${ip}`) : null;
      if (["claimed", "pending", "published"].includes(t.status)) claimed++;
      return { x: t.x, y: t.y, status: t.status, name: isPub ? t.artist_name : null, loc: isPub ? t.artist_location : null, story: isPub ? t.story : null, img };
    });
  }

  let myTile = null;
  if (email && canvas) {
    const mt = await findMyTile(supabaseAdmin(), canvas.id, email);
    if (mt) {
      // cache-bust the draft URL with its updated_at so a new device always pulls the latest
      const draftUrl = mt.draft_image_path ? `${artUrl(mt.draft_image_path)}?v=${encodeURIComponent(mt.draft_updated_at ?? "")}` : null;
      myTile = { id: mt.id, idx: mt.y * cols + mt.x, status: mt.status, artUrl: artUrl(mt.pending_image_path || mt.image_path), story: mt.pending_story || mt.story, draftUrl, draftStory: mt.draft_story ?? null };
    }
  }

  return <Explorer cols={cols} total={total} tiles={tiles} claimed={claimed} email={email} myTile={myTile} autoOpenMine={autoOpenMine} />;
}
