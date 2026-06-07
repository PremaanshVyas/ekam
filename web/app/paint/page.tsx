import { redirect } from "next/navigation";
import Painter from "@/components/Painter";
import SiteHeader from "@/components/SiteHeader";
import { supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";
import { findMyTile, tileImageUrl } from "@/lib/tiles";

export const dynamic = "force-dynamic";

export default async function PaintPage() {
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.email) redirect("/me"); // sign in on the dashboard first

  const db = supabaseAdmin();
  const { data: canvas } = await db.from("canvases").select("id").eq("slug", CANVAS_SLUG).maybeSingle();
  const tile = canvas ? await findMyTile(db, canvas.id, user.email) : null;
  if (!tile) redirect("/claim"); // no tile yet → claim one

  const initialImage = tileImageUrl(tile.pending_image_path || tile.image_path);

  return (
    <>
      <SiteHeader email={user.email} />
      <main style={{ minHeight: "100%", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 24px 80px" }}>
        <Painter
          tileId={tile.id} x={tile.x} y={tile.y} status={tile.status}
          initialImage={initialImage} initialStory={tile.pending_story ?? tile.story ?? ""}
        />
      </main>
    </>
  );
}
