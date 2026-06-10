import Landing from "@/components/Landing";
import { supabaseAnon, supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";
import { findMyTile } from "@/lib/tiles";

export const dynamic = "force-dynamic";
const pad = (n: number) => String(n).padStart(2, "0");

export default async function Home() {
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  const email = user?.email ?? null;

  const db = supabaseAnon();
  const { data: canvas } = await db
    .from("canvases").select("id, grid_cols, grid_rows").eq("slug", CANVAS_SLUG).maybeSingle();
  const cols = canvas?.grid_cols ?? 24;
  const rows = canvas?.grid_rows ?? 24;
  const total = cols * rows;

  let claimed = 0, published = 0;
  if (canvas) {
    const { data } = await db.from("public_tiles").select("status").eq("canvas_id", canvas.id);
    for (const t of (data ?? []) as { status: string }[]) {
      if (["claimed", "pending", "published"].includes(t.status)) claimed++;
      if (t.status === "published") published++;
    }
  }

  let myTile: { label: string } | null = null;
  if (email && canvas) {
    const mt = await findMyTile(supabaseAdmin(), canvas.id, email);
    if (mt) myTile = { label: "R" + pad(mt.y + 1) + "·C" + pad(mt.x + 1) };
  }

  return <Landing total={total} claimed={claimed} published={published} email={email} myTile={myTile} />;
}
