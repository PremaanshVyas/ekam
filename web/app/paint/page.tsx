import Link from "next/link";
import Painter from "@/components/Painter";
import { supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const notice = (msg: string, href: string, cta: string) => (
  <main style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 48 }}>
    <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 26, color: "var(--color-text-primary)" }}>{msg}</p>
    <Link href={href} style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-ink)", borderRadius: 4, padding: "11px 22px", textDecoration: "none" }}>{cta}</Link>
  </main>
);

export default async function PaintPage() {
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.email) return notice("sign in to paint your tile", "/claim", "sign in →");
  const email = user.email.toLowerCase();

  const db = supabaseAdmin();
  const { data: canvas } = await db.from("canvases").select("id").eq("slug", CANVAS_SLUG).maybeSingle();
  if (!canvas) return notice("the canvas isn't available right now", "/", "← home");

  // Find the signed-in person's tile (works on any device — keyed to their email).
  const { data: tile } = await db
    .from("tiles")
    .select("id, x, y, status, image_path, pending_image_path, story, pending_story")
    .eq("canvas_id", canvas.id)
    .eq("artist_email", email)
    .in("status", ["claimed", "pending", "published"])
    .limit(1)
    .maybeSingle();

  if (!tile) return notice("you haven't claimed a tile yet", "/claim", "claim a tile →");

  // Pre-load the current art (the pending edit if any, else the live image).
  const ip = tile.pending_image_path || tile.image_path;
  const initialImage = ip ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tiles/${ip}` : null;

  return (
    <main style={{ minHeight: "100%", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 24px 80px" }}>
      <Painter tileId={tile.id} x={tile.x} y={tile.y} status={tile.status} initialImage={initialImage} initialStory={tile.pending_story ?? tile.story ?? ""} />
    </main>
  );
}
