import { ImageResponse } from "next/og";

export const alt = "ekam.ink — r/place was a battlefield. This is a quilt.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Painting palette (the art) + paper for open cells
const PALETTE = ["#C76B4A", "#9C4A33", "#E0A33E", "#8A9A5B", "#4F6F52", "#6E94BE", "#4E5C8A", "#8A5A78", "#20201D"];
const PAPER = "#F3F1EA";

// Deterministic, organic-looking scatter for the mini quilt
function cellColor(i: number, j: number): string {
  const h = (i * 73 + j * 149 + i * j * 17) % 100;
  if (h < 44) return PAPER; // open tile
  return PALETTE[(i * 3 + j * 5 + h) % PALETTE.length];
}

const TTF = "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@latest";
async function loadFonts() {
  try {
    const [bold, medium] = await Promise.all([
      fetch(`${TTF}/latin-700-normal.ttf`).then((r) => r.arrayBuffer()),
      fetch(`${TTF}/latin-500-normal.ttf`).then((r) => r.arrayBuffer()),
    ]);
    return [
      { name: "Space Grotesk", data: bold, weight: 700 as const, style: "normal" as const },
      { name: "Space Grotesk", data: medium, weight: 500 as const, style: "normal" as const },
    ];
  } catch {
    return undefined; // fall back to the default font — never fail the build
  }
}

export default async function Image() {
  const fonts = await loadFonts();
  const N = 9;
  const rows = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => cellColor(i, j)));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 80px", background: "#F5F3ED", color: "#1A1916", fontFamily: "Space Grotesk",
        }}
      >
        {/* Left — wordmark + copy */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 620 }}>
          <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>ekam.ink</div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, marginTop: 34, lineHeight: 1.2 }}>
            r/place was a battlefield. This is a quilt.
          </div>
          <div style={{ display: "flex", fontSize: 23, fontWeight: 500, color: "#57544C", marginTop: 18, lineHeight: 1.4 }}>
            one shared canvas, painted one tile at a time by hundreds of strangers.
          </div>
        </div>

        {/* Right — mini quilt, framed */}
        <div
          style={{
            display: "flex", flexDirection: "column", gap: 5, padding: 18,
            background: "#FFFFFF", borderRadius: 22, border: "1px solid #E1DED4",
          }}
        >
          {rows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 5 }}>
              {row.map((c, j) => (
                <div key={j} style={{ width: 38, height: 38, borderRadius: 4, background: c }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) }
  );
}
