import Canvas, { type RenderTile } from "@/components/Canvas";
import LivePoll from "@/components/LivePoll";
import { supabaseAnon, CANVAS_SLUG } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Row = {
  x: number; y: number; status: string;
  artist_name: string | null; artist_location: string | null;
  story: string | null; image_path: string | null;
};

export default async function Home() {
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
  const pct = total ? Math.round((painted / total) * 100) : 0;

  return (
    <main style={{ minHeight: "100%", maxWidth: "100%", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
      <LivePoll />
      <header
        className="fade-up"
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, padding: "22px 36px", flexWrap: "wrap",
        }}
      >
        <span style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 27, color: "var(--color-text-primary)" }}>
          ekam.ink
        </span>

        <div
          style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)",
            borderRadius: 9999, padding: "8px 18px",
          }}
        >
          <span style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 18, color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>
            {painted} of {total} painted
          </span>
          <div style={{ width: 150, height: 8, borderRadius: 9999, background: "var(--stone-300)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--palette-clay)", transition: "width .4s ease" }} />
          </div>
        </div>

        <a
          href="/claim"
          className="lift"
          style={{
            fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500,
            color: "var(--color-text-inverse)", background: "var(--palette-ink)",
            borderRadius: 9999, padding: "10px 22px", textDecoration: "none", display: "inline-block",
          }}
        >
          claim a tile
        </a>
      </header>

      <section
        style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          gap: 20, padding: "16px 24px 80px",
        }}
      >
        <p
          className="fade-up"
          style={{
            fontFamily: "var(--font-display), sans-serif", fontSize: 26, lineHeight: 1.3,
            color: "var(--color-text-secondary)", textAlign: "center", maxWidth: 640, margin: 0,
            animationDelay: "80ms",
          }}
        >
          “where were you when home looked like this?”
        </p>

        {/* framed matte — the artwork, mounted */}
        <div
          className="fade-up"
          style={{
            width: "100%", maxWidth: 676, minWidth: 0, boxSizing: "border-box",
            padding: 18, background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-default)", borderRadius: 20,
            boxShadow: "0 18px 50px -16px rgba(26,25,22,.22), 0 2px 8px rgba(26,25,22,.08)",
            animationDelay: "160ms",
          }}
        >
          <Canvas tiles={grid} cols={cols} />
        </div>

        <p className="fade-up" style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", textAlign: "center", margin: 0, animationDelay: "240ms" }}>
          one shared canvas, painted one tile at a time by hundreds of strangers · drag to pan · scroll to zoom
        </p>
      </section>
    </main>
  );
}
