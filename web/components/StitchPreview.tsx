"use client";

import { useEffect, useRef, useState } from "react";
import { stitchWall, downloadBlob, type StitchTile } from "@/lib/stitch";

/* The growing artwork: published tiles as art, everything else as paper.
 * Preview renders from thumbs (fast); Download stitches from the full PNGs. */
export default function StitchPreview({
  tiles, previewTiles, cols, rows, people, fromDate, toDate,
}: {
  tiles: StitchTile[];          // full-res URLs (download)
  previewTiles: StitchTile[];   // thumb URLs (on-screen preview)
  cols: number; rows: number; people: number; fromDate: string | null; toDate: string | null;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const blob = await stitchWall(previewTiles, cols, rows, 96);
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => {
        const cv = ref.current; if (!cv) { URL.revokeObjectURL(url); return; }
        const size = cv.clientWidth;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = size * dpr; cv.height = size * dpr;
        const g = cv.getContext("2d")!;
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
        g.drawImage(im, 0, 0, size * dpr, size * dpr);
        URL.revokeObjectURL(url);
      };
      im.src = url;
    })();
    return () => { cancelled = true; };
  }, [previewTiles, cols, rows]);

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null);
  const from = fmt(fromDate), to = fmt(toDate);

  const download = async () => {
    if (busy) return; setBusy(true); setPct(0);
    try {
      const blob = await stitchWall(tiles, cols, rows, 384, (d, t) => setPct(Math.round((d / t) * 100)));
      downloadBlob(blob, "ekam-canvas-001.png");
    } catch { /* surfaced via button state reset */ }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <canvas ref={ref} style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 10, border: "1px solid var(--color-border-default)", background: "#f4eee2", display: "block" }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 21, color: "var(--color-text-primary)" }}>what home looks like</div>
        <div style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
          Canvas Nº 001 · {people} {people === 1 ? "person" : "people"} so far{from && to ? ` · ${from === to ? from : `${from} to ${to}`}` : ""}
        </div>
      </div>
      <button onClick={download} disabled={busy} style={{ fontFamily: "var(--sans)", fontSize: 14.5, fontWeight: 600, color: "#16110d", background: "var(--accent)", border: "none", borderRadius: 8, padding: 12, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>
        {busy ? `Stitching… ${pct}%` : "Download the artwork (PNG)"}
      </button>
      <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 12, color: "var(--color-text-muted)", margin: 0, textAlign: "center" }}>
        Blank tiles render as paper. Download stitches the full quality paintings (9216 × 9216 px).
      </p>
    </div>
  );
}
