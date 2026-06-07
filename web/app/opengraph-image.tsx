import { ImageResponse } from "next/og";

export const alt = "ekam.ink — 576 strangers. One canvas. One moment in history.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PALETTE = ["#C76B4A", "#9C4A33", "#E0A33E", "#8A9A5B", "#4F6F52", "#6E94BE", "#4E5C8A", "#8A5A78", "#20201D"];
const PAPER = "#F0EADC";

function cellColor(i: number, j: number): string {
  const h = (i * 73 + j * 149 + i * j * 17) % 100;
  if (h < 44) return PAPER;
  return PALETTE[(i * 3 + j * 5 + h) % PALETTE.length];
}

const FS = "https://cdn.jsdelivr.net/fontsource/fonts";
async function loadFonts() {
  try {
    const [serif, sans] = await Promise.all([
      fetch(`${FS}/fraunces@latest/latin-600-normal.ttf`).then((r) => r.arrayBuffer()),
      fetch(`${FS}/inter@latest/latin-500-normal.ttf`).then((r) => r.arrayBuffer()),
    ]);
    return [
      { name: "Fraunces", data: serif, weight: 600 as const, style: "normal" as const },
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
          padding: "0 78px", background: "#F7F4EC", color: "#1A1813", fontFamily: "Inter",
        }}
      >
        {/* Left — overline + serif headline + wordmark */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div style={{ fontFamily: "Inter", fontSize: 19, letterSpacing: 3, textTransform: "uppercase", color: "#6E6A5E" }}>
            Canvas Nº 001 — what home looks like
          </div>
          <div style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 62, lineHeight: 1.05, marginTop: 26, color: "#1A1813" }}>
            576 strangers. One canvas. One moment in history.
          </div>
          <div style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 26, marginTop: 30, color: "#524E45" }}>
            ekam.ink
          </div>
        </div>

        {/* Right — mini quilt, framed */}
        <div
          style={{
            display: "flex", flexDirection: "column", gap: 5, padding: 18,
            background: "#FFFFFF", borderRadius: 10, border: "1px solid #E5DFD1",
          }}
        >
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
