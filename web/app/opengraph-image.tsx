import { ImageResponse } from "next/og";

export const alt = "ekam.ink — 576 strangers. One canvas. One moment in history.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// warm-dark chrome + one ember accent + a few painted cells (matches the site)
const PALETTE = ["#e8643c", "#f0913c", "#ffc861", "#2f9e6e", "#5fcf8f", "#2f8fae", "#54bcd6", "#6c5ce0", "#e85d7a", "#c79a5e"];
const DARK = "#1d1712";

function cellColor(i: number, j: number): string {
  const h = (i * 73 + j * 149 + i * j * 17) % 100;
  if (h < 62) return DARK;
  return PALETTE[(i * 3 + j * 5 + h) % PALETTE.length];
}

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

export default async function Image() {
  const fonts = await loadFonts();
  const N = 9;
  const rows = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => cellColor(i, j)));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 78px", background: "#16110d", color: "#efe9e1", fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div style={{ fontFamily: "Inter", fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#7d7264" }}>
            Canvas Nº 001 — what home looks like
          </div>
          <div style={{ fontFamily: "Spectral", fontSize: 62, lineHeight: 1.02, marginTop: 26, letterSpacing: -1, display: "flex", flexWrap: "wrap" }}>
            <span style={{ color: "#efe9e1" }}>576 strangers. One canvas.&nbsp;</span>
            <span style={{ color: "#e8643c" }}>One moment in history.</span>
          </div>
          <div style={{ fontFamily: "Inter", fontSize: 22, marginTop: 30, color: "#b3a89b", letterSpacing: 2 }}>ekam.ink</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: 16, background: "#1d1712", borderRadius: 12, border: "1px solid rgba(239,233,225,0.11)" }}>
          {rows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 5 }}>
              {row.map((c, j) => (
                <div key={j} style={{ width: 38, height: 38, borderRadius: 3, background: c }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) }
  );
}
