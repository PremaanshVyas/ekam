import { type RenderTile } from "@/components/Canvas";
import Explorer from "@/components/Explorer";
import LivePoll from "@/components/LivePoll";
import { supabaseAnon, CANVAS_SLUG } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/auth-server";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

type Row = {
  x: number; y: number; status: string;
  artist_name: string | null; artist_location: string | null;
  story: string | null; image_path: string | null;
};

const overline: React.CSSProperties = {
  fontFamily: "var(--font-ui), sans-serif", textTransform: "uppercase", letterSpacing: "0.2em",
  fontSize: 12, fontWeight: 500, color: "var(--color-text-muted)",
};

export default async function Home() {
  const authClient = await createSupabaseServer();
  const { data: { user } } = await authClient.auth.getUser();
  const db = supabaseAnon();
  const { data: canvas } = await db
    .from("canvases")
    .select("id, grid_cols, grid_rows")
    .eq("slug", CANVAS_SLUG)
    .maybeSingle();

  const cols = canvas?.grid_cols ?? 24;
  const rows = canvas?.grid_rows ?? 24;

  let dbTiles: Row[] = [];
  if (canvas) {
    const { data } = await db
      .from("public_tiles")
      .select("x, y, status, artist_name, artist_location, story, image_path")
      .eq("canvas_id", canvas.id);
    dbTiles = (data as Row[]) ?? [];
  }

  const map = new Map(dbTiles.map((t) => [t.y * cols + t.x, t]));
  const grid: RenderTile[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = map.get(y * cols + x);
      const isPub = t?.status === "published";
      const ip = isPub ? t!.image_path : null;
      const isHex = !!ip && ip.startsWith("#");
      grid.push({
        x, y,
        painted: !!isPub,
        color: isPub ? (isHex ? ip! : "#C76B4A") : undefined,
        img: isPub && ip && !isHex ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tiles/${ip}` : undefined,
        story: isPub ? t!.story ?? undefined : undefined,
        name: isPub ? t!.artist_name ?? undefined : undefined,
        loc: isPub ? t!.artist_location ?? undefined : undefined,
      });
    }
  }

  const painted = grid.filter((t) => t.painted).length;
  const total = cols * rows;
  const pct = total ? Math.round((painted / total) * 1000) / 10 : 0;

  const linkPrimary: React.CSSProperties = {
    fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500,
    color: "var(--color-text-inverse)", background: "var(--palette-ink)",
    borderRadius: 4, padding: "13px 26px", textDecoration: "none", display: "inline-block",
  };
  const linkGhost: React.CSSProperties = {
    fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500,
    color: "var(--color-text-primary)", background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-strong)",
    borderRadius: 4, padding: "12px 25px", textDecoration: "none", display: "inline-block",
  };

  return (
    <main style={{ minHeight: "100%", maxWidth: "100%", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
      <LivePoll />

      <SiteHeader email={user?.email ?? null} />

      {/* ── Hero ── */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "72px 24px 24px", gap: 0 }}>
        <span className="fade-up" style={{ ...overline }}>Canvas Nº 001 — what home looks like</span>
        <h1 className="serif fade-up" style={{ fontSize: "clamp(2.6rem, 6.4vw, 5rem)", margin: "26px 0 0", maxWidth: 980, lineHeight: 1.04, letterSpacing: "-0.01em", animationDelay: "60ms" }}>
          576 strangers. One canvas.<br />One moment in history.
        </h1>
        <p className="fade-up" style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 18, lineHeight: 1.55, color: "var(--color-text-secondary)", maxWidth: 560, margin: "26px 0 0", animationDelay: "120ms" }}>
          Claim a tile. Hand-paint what home looks like within the canvas palette. When the painting is complete, it becomes one artwork — and your story lives on it forever.
        </p>
        <div className="fade-up" style={{ display: "flex", gap: 12, marginTop: 34, flexWrap: "wrap", justifyContent: "center", animationDelay: "180ms" }}>
          <Link href="/claim" className="lift" style={linkPrimary}>claim a tile</Link>
          <Link href="#canvas" className="lift" style={linkGhost}>see the canvas</Link>
        </div>

        {/* ── Live card ── */}
        <div className="fade-up" style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 44, padding: "16px 26px", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 6, flexWrap: "wrap", justifyContent: "center", animationDelay: "240ms" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-ui), sans-serif", fontSize: 14, color: "var(--color-text-secondary)" }}>
            <span className="pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-live)", display: "inline-block" }} />
            Live
          </span>
          <span style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 15, color: "var(--color-text-muted)" }}>
            <span className="serif" style={{ fontSize: 26, color: "var(--color-text-primary)" }}>{painted}</span> / {total} tiles painted
          </span>
          <span style={{ width: 150, height: 2, background: "var(--color-border-strong)", position: "relative", display: "inline-block" }}>
            <span style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: "var(--palette-ink)" }} />
          </span>
          <span style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 14, color: "var(--color-text-secondary)" }}>{pct}%</span>
        </div>
      </section>

      {/* ── Explorer ── */}
      <div style={{ paddingTop: 56 }}>
        <Explorer grid={grid} cols={cols} painted={painted} total={total} />
      </div>

      {/* ── Closing ── */}
      <footer style={{ textAlign: "center", padding: "0 24px 96px", borderTop: "1px solid var(--color-border-default)", paddingTop: 72 }}>
        <p className="serif" style={{ fontSize: "clamp(1.6rem, 3.6vw, 2.4rem)", margin: 0, lineHeight: 1.15 }}>
          You weren&apos;t just a visitor. You were part of it.
        </p>
        <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 15, color: "var(--color-text-muted)", marginTop: 12 }}>
          every tile is one stranger&apos;s answer to what home looks like.
        </p>
      </footer>
    </main>
  );
}
