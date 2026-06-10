import Landing from "@/components/Landing";
import { supabaseAnon, CANVAS_SLUG } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
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

  return <Landing total={total} claimed={claimed} published={published} />;
}
