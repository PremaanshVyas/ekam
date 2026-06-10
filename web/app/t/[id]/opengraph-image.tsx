import { ImageResponse } from "next/og";
import { supabaseAnon } from "@/lib/supabase";

export const alt = "A tile on ekam.ink · what home looks like";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const FS = "https://cdn.jsdelivr.net/fontsource/fonts";

async function loadFonts() {
  try {
    const [serif, sans] = await Promise.all([
      fetch(`${FS}/spectral@latest/latin-400-normal.ttf`).then((r) => r.arrayBuffer()),
      fetch(`${FS}/inter@latest/latin-500-normal.ttf`).then((r) => r.arrayBuffer()),
    ]);
    return [
      { name: "Spectral", data: serif, weight: 400 as const, style: "normal" as const },
      { name: "Inter", data: sans, weight: 500 as const, style: "normal" as const },
    ];
  } catch {
    return undefined;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fonts = await loadFonts();
  const { data: t } = await supabaseAnon().from("public_tiles").select("status, artist_name, story, image_path").eq("id", id).maybeSingle();
  const live = (t as { status?: string } | null)?.status === "published";
  const tt = t as { artist_name: string | null; story: string | null; image_path: string | null } | null;
  const img = live && tt?.image_path && !tt.image_path.startsWith("#") ? `${SUPA}/storage/v1/object/public/tiles/${tt.image_path}` : null;
  const hex = live && tt?.image_path && tt.image_path.startsWith("#") ? tt.image_path : null;
  const who = live && tt?.artist_name ? tt.artist_name : "someone";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 64, padding: "0 80px", background: "#16110d", color: "#efe9e1", fontFamily: "Inter" }}>
        <div style={{ display: "flex", width: 460, height: 460, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(239,233,225,0.12)", background: "#f4eee2", flex: "none" }}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} width={460} height={460} style={{ objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", width: "100%", height: "100%", background: hex || "#f4eee2" }} />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 540 }}>
          <div style={{ fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#7d7264" }}>Canvas Nº 001 · what home looks like</div>
          <div style={{ fontFamily: "Spectral", fontSize: 60, lineHeight: 1.04, marginTop: 22, letterSpacing: -1, display: "flex", flexWrap: "wrap" }}>
            <span style={{ color: "#efe9e1" }}>{who}’s&nbsp;</span>
            <span style={{ color: "#e8643c" }}>tile.</span>
          </div>
          {live && tt?.story ? (
            <div style={{ fontFamily: "Spectral", fontSize: 27, fontStyle: "italic", marginTop: 22, color: "#b3a89b" }}>{`“${tt.story.slice(0, 90)}”`}</div>
          ) : (
            <div style={{ fontSize: 24, marginTop: 22, color: "#b3a89b" }}>Leave the words. Draw the lines.</div>
          )}
          <div style={{ fontSize: 22, marginTop: 30, color: "#7d7264", letterSpacing: 2 }}>ekam.ink</div>
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) }
  );
}
