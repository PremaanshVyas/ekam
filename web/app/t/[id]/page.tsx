import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAnon, supabaseAdmin } from "@/lib/supabase";
import ShareTile from "@/components/ShareTile";
import Logo from "@/components/Logo";

export const dynamic = "force-dynamic";

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SITE = "https://ekam.ink";
const artUrl = (p: string | null) => (p && !p.startsWith("#") ? `${SUPA}/storage/v1/object/public/tiles/${p}` : null);

type Tile = { id: string; x: number; y: number; status: string; artist_name: string | null; artist_location: string | null; story: string | null; image_path: string | null };

async function getTile(id: string): Promise<Tile | null> {
  // public_tiles nulls all content for non-published rows, so nothing unapproved leaks.
  const { data } = await supabaseAnon().from("public_tiles").select("id, x, y, status, artist_name, artist_location, story, image_path").eq("id", id).maybeSingle();
  return (data as Tile) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTile(id);
  const live = t?.status === "published";
  const who = live && t?.artist_name ? `${t.artist_name}’s tile` : "A tile";
  const title = `${who} · many hands, one canvas`;
  const description = live && t?.story ? `“${t.story}” · Canvas Nº 001 on ekam.ink` : "Leave the words. Draw the lines. Claim a tile and paint your piece of one canvas.";
  return {
    title, description,
    openGraph: { title, description, url: `${SITE}/t/${id}`, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTile(id);
  if (!t) notFound();
  const live = t.status === "published";
  // upvotes: this tile's count + whether it currently leads the wall (server-only reads)
  let votes = 0, mostLoved = false;
  if (live) {
    try {
      const { data: all } = await supabaseAdmin().from("tile_votes").select("tile_id");
      const tally = new Map<string, number>();
      for (const v of all ?? []) tally.set(v.tile_id, (tally.get(v.tile_id) ?? 0) + 1);
      votes = tally.get(id) ?? 0;
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      mostLoved = !!top && top[0] === id && votes > 0;
    } catch { /* migration 0007 not run yet */ }
  }
  const img = live ? artUrl(t.image_path) : null;
  const hex = live && t.image_path && t.image_path.startsWith("#") ? t.image_path : null;
  const label = "R" + String(t.y + 1).padStart(2, "0") + " · C" + String(t.x + 1).padStart(2, "0");

  return (
    <main className="sharepage">
      <div className="sharepage__home"><Logo sm /></div>
      <div className="sharepage__card">
        <div className="sharepage__eyebrow">Canvas Nº 001 · many hands, one canvas</div>
        {mostLoved && <div className="sharepage__laurel">✦ Most loved on the wall</div>}
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={t.story || "a painted tile"} className="sharepage__art" />
        ) : hex ? (
          <div className="sharepage__art" style={{ background: hex }} />
        ) : (
          <div className="sharepage__pending">{t.status === "pending" ? "This tile is in review. Check back soon." : "This tile hasn’t been painted yet."}</div>
        )}
        <div className="sharepage__meta">
          <div className="sharepage__by">{live && t.artist_name ? t.artist_name : "someone"}{live && t.artist_location ? <span className="sharepage__loc"> · {t.artist_location}</span> : null}</div>
          <div className="sharepage__id">{label}{votes > 0 ? ` · ♥ ${votes}` : ""}</div>
        </div>
        {live && t.story && <blockquote className="sharepage__story">“{t.story}”</blockquote>}
        {(img || hex) && <ShareTile url={`${SITE}/t/${id}`} imageUrl={img || ""} title={live && t.artist_name ? `${t.artist_name}’s tile on ekam.ink · many hands, one canvas` : "A tile on ekam.ink · many hands, one canvas"} />}
        <Link href="/canvas" className="btn btn--primary btn--block sharepage__cta">{live ? "Add your own tile →" : "Explore the canvas →"}</Link>
      </div>
    </main>
  );
}
