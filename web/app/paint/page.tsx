import Link from "next/link";
import { cookies } from "next/headers";
import Painter from "@/components/Painter";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const notice = (msg: string, href: string, cta: string) => (
  <main style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 48 }}>
    <p style={{ fontFamily: "var(--font-shantell), cursive", fontSize: 24, color: "var(--color-text-primary)" }}>{msg}</p>
    <Link href={href} style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 15, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-ink)", borderRadius: 9999, padding: "10px 22px", textDecoration: "none" }}>{cta}</Link>
  </main>
);

export default async function PaintPage() {
  const tileId = (await cookies()).get("tile")?.value;
  if (!tileId) return notice("you haven't claimed a tile yet", "/claim", "claim a tile →");

  const db = supabaseAdmin();
  const { data: tile } = await db.from("tiles").select("id, x, y, status").eq("id", tileId).maybeSingle();
  if (!tile || tile.status !== "claimed") return notice("this tile isn't yours to paint right now", "/claim", "claim a tile →");

  return (
    <main style={{ minHeight: "100%", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 24px 80px" }}>
      <Painter tileId={tile.id} x={tile.x} y={tile.y} />
    </main>
  );
}
