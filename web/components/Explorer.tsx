"use client";

import { useState } from "react";
import Link from "next/link";
import Canvas, { type RenderTile } from "@/components/Canvas";

const overline: React.CSSProperties = {
  fontFamily: "var(--font-ui), sans-serif", textTransform: "uppercase", letterSpacing: "0.18em",
  fontSize: 11, fontWeight: 500, color: "var(--color-text-muted)",
};
const serif = (size: number): React.CSSProperties => ({
  fontFamily: "var(--font-display), Georgia, serif", fontSize: size, color: "var(--color-text-primary)", lineHeight: 1.15,
});
const rule: React.CSSProperties = { height: 1, background: "var(--color-border-default)", border: "none", margin: "20px 0", width: "100%" };

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", fontFamily: "var(--font-ui), sans-serif", fontSize: 14 }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default function Explorer({ grid, cols, painted, total }: { grid: RenderTile[]; cols: number; painted: number; total: number }) {
  const [sel, setSel] = useState<RenderTile | null>(null);
  const pct = total ? Math.round((painted / total) * 1000) / 10 : 0;
  const remaining = total - painted;

  return (
    <section id="canvas" className="explorer" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 96px", width: "100%", boxSizing: "border-box" }}>
      {/* ── Left rail ── */}
      <aside className="fade-up" style={{ display: "flex", flexDirection: "column" }}>
        <span style={overline}>Canvas Nº 001</span>
        <h2 style={{ ...serif(28), margin: "8px 0 0" }}>what home looks like</h2>
        <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 14, color: "var(--color-text-secondary)", margin: "10px 0 0", lineHeight: 1.5 }}>
          a collective self-portrait — painted one tile at a time by strangers around the world.
        </p>
        <hr style={rule} />
        <span style={overline}>Palette — full spectrum</span>
        <div style={{ marginTop: 12, height: 26, borderRadius: 4, border: "1px solid rgba(0,0,0,0.08)", background: "linear-gradient(90deg, #1A1A1A, #E03B3B, #F07A29, #F4C430, #2E8B57, #1FA6A6, #2D6CDF, #7A3FB0, #E0559E, #FFFFFF)" }} />
        <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 12, color: "var(--color-text-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>any colour — full creative freedom.</p>
        <hr style={rule} />
        <StatRow label="Completion" value={`${pct}%`} />
        <StatRow label="Tiles painted" value={`${painted}`} />
        <StatRow label="Tiles remaining" value={`${remaining}`} />
        <StatRow label="Status" value={remaining === 0 ? "Complete" : "Open"} />
      </aside>

      {/* ── Canvas ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <span style={{ ...overline, alignSelf: "flex-start", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 9999, padding: "5px 12px", letterSpacing: "0.12em" }}>
          scroll to zoom · drag to pan · click a tile
        </span>
        <Canvas tiles={grid} cols={cols} onSelect={setSel} />
      </div>

      {/* ── Right tile-detail panel ── */}
      <aside style={{ minWidth: 0 }}>
        {sel ? (
          <div key={`${sel.x}-${sel.y}`} className="rise-panel" style={{ display: "flex", flexDirection: "column", border: "1px solid var(--color-border-default)", background: "var(--color-bg-elevated)", borderRadius: 6, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={overline}>Tile {sel.x},{sel.y}</span>
              <button onClick={() => setSel(null)} aria-label="close tile" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 18, lineHeight: 1, padding: 0 }}>✕</button>
            </div>
            <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 4, marginTop: 14, border: "1px solid var(--color-border-default)", backgroundColor: sel.color ?? "var(--palette-paper)", backgroundImage: sel.img ? `url("${sel.img}")` : undefined, backgroundSize: "cover", backgroundPosition: "center", imageRendering: "auto" }} />
            {sel.story && <p style={{ ...serif(20), margin: "16px 0 0", lineHeight: 1.35 }}>“{sel.story}”</p>}
            <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 14, color: "var(--color-text-secondary)", margin: "12px 0 0" }}>
              — {sel.name ?? "anonymous"}{sel.loc ? ` · ${sel.loc}` : ""}
            </p>
            <div style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>part of the canvas, forever.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", border: "1px dashed var(--color-border-strong)", borderRadius: 6, padding: 20 }}>
            <span style={overline}>The canvas</span>
            <p style={{ ...serif(19), margin: "10px 0 0", lineHeight: 1.3, color: "var(--color-text-secondary)" }}>“where were you when home looked like this?”</p>
            <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 14, color: "var(--color-text-muted)", margin: "14px 0 0", lineHeight: 1.5 }}>
              Click a painted tile to read its story. Click an empty tile to claim your own.
            </p>
            <Link href="/claim" className="lift" style={{ marginTop: 18, textAlign: "center", fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-ink)", borderRadius: 4, padding: "11px 18px", textDecoration: "none" }}>claim a tile</Link>
          </div>
        )}
      </aside>
    </section>
  );
}
