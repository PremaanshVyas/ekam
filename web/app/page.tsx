import Landing from "@/components/Landing";
import { supabaseAnon, supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";
import { findMyTile } from "@/lib/tiles";
import { canvasClosesAt } from "@/lib/deadline";

export const dynamic = "force-dynamic";
const pad = (n: number) => String(n).padStart(2, "0");

export default async function Home() {
  let closesAt: string | null = null;
  let total = 576, claimed = 0, published = 0;
  let email: string | null = null;
  let myTile: { label: string } | null = null;

  try {
    const auth = await createSupabaseServer();
    const db = supabaseAnon();
    closesAt = await canvasClosesAt(db);
    const [{ data: { user } }, { data: canvas }] = await Promise.all([
      auth.auth.getUser(),
      db.from("canvases").select("id, grid_cols, grid_rows").eq("slug", CANVAS_SLUG).maybeSingle(),
    ]);
    email = user?.email ?? null;
    const cols = canvas?.grid_cols ?? 24;
    const rows = canvas?.grid_rows ?? 24;
    total = cols * rows;

    if (canvas) {
      // Head-only count queries (no row payloads) + my tile, all in parallel.
      const [claimedRes, publishedRes, mt] = await Promise.all([
        db.from("public_tiles").select("id", { count: "exact", head: true }).eq("canvas_id", canvas.id).in("status", ["claimed", "pending", "published"]),
        db.from("public_tiles").select("id", { count: "exact", head: true }).eq("canvas_id", canvas.id).eq("status", "published"),
        email ? findMyTile(supabaseAdmin(), canvas.id, email) : Promise.resolve(null),
      ]);
      claimed = claimedRes.count ?? 0;
      published = publishedRes.count ?? 0;
      if (mt) myTile = { label: "R" + pad(mt.y + 1) + "·C" + pad(mt.x + 1) };
    }
  } catch {
    // Landing must always render — counts fall back to zero rather than erroring.
  }

  return <Landing closesAt={closesAt} total={total} claimed={claimed} published={published} email={email} myTile={myTile} />;
}
