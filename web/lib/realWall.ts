/* Real wall — builds the explorer's composite from live Supabase tiles, exposing
 * the same `Wall` shape the demo wall uses so MosaicCanvas renders it unchanged.
 * Only published tiles carry public art (PNG path or founder hex); open/claimed/
 * pending render as dark cells. Client-only (uses <canvas> + Image).
 *
 * Perf: the composite loads each tile's small thumb when available (full PNG only
 * as a fallback), and the per-tile resolution adapts to the device so low-memory
 * phones never allocate a 37MB bitmap. */

import type { Wall, TileInfo } from "@/lib/demoWall";

const PAPER = "#f4eee2";
const BG = "#16110d";
const ACCENT = "#e8643c";

export type RealTileInput = {
  x: number; y: number; status: string;
  name: string | null; loc: string | null; story: string | null;
  img: string | null;   // published full PNG URL, founder hex (#...), or null
  thumb: string | null; // small PNG URL for the wall composite, if generated
};

const TAKEN = ["claimed", "pending", "published"];
const pad = (n: number) => String(n).padStart(2, "0");

export function createRealWall(GRID: number, tiles: RealTileInput[], myIdx: number, onProgress: () => void): Wall {
  // Adaptive composite resolution: small screens get 64px/tile (24×24 → 1536²,
  // ~9MB), larger screens 128px/tile. Detail views always load the full PNG.
  const small = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 700;
  const TILE_PX = small ? 64 : 128;

  const HI = GRID * TILE_PX, N_TOTAL = GRID * GRID;
  const byIdx = new Map<number, RealTileInput>();
  for (const t of tiles) byIdx.set(t.y * GRID + t.x, t);

  const hi = document.createElement("canvas"); hi.width = HI; hi.height = HI;
  const g = hi.getContext("2d")!; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.fillStyle = BG; g.fillRect(0, 0, HI, HI);

  const drawTo = (im: HTMLImageElement, X: number, Y: number) => {
    g.fillStyle = PAPER; g.fillRect(X, Y, TILE_PX, TILE_PX);
    g.drawImage(im, X, Y, TILE_PX, TILE_PX);
    onProgress();
  };
  const paintCell = (idx: number) => {
    const t = byIdx.get(idx); if (!t || t.status !== "published" || !t.img) return;
    const X = (idx % GRID) * TILE_PX, Y = ((idx / GRID) | 0) * TILE_PX;
    if (t.img.startsWith("#")) { g.fillStyle = t.img; g.fillRect(X, Y, TILE_PX, TILE_PX); return; }
    // thumb first; if it 404s (older tiles), retry with the full PNG; if that
    // fails too, paint paper so the tile never stays a black hole.
    const tryLoad = (url: string, fallback: string | null) => {
      const im = new Image();
      im.onload = () => drawTo(im, X, Y);
      im.onerror = () => {
        if (fallback) tryLoad(fallback, null);
        else { g.fillStyle = PAPER; g.fillRect(X, Y, TILE_PX, TILE_PX); onProgress(); }
      };
      im.src = url;
    };
    if (t.thumb) tryLoad(t.thumb, t.img); else tryLoad(t.img, null);
  };
  for (let i = 0; i < N_TOTAL; i++) paintCell(i);

  const claimedCount = tiles.reduce((n, t) => n + (TAKEN.includes(t.status) ? 1 : 0), 0);
  const isClaimed = (idx: number) => { const t = byIdx.get(idx); return !!t && TAKEN.includes(t.status); };

  const infoFor = (idx: number): TileInfo => {
    const x = idx % GRID, y = (idx / GRID) | 0; const t = byIdx.get(idx);
    const claimed = !!t && TAKEN.includes(t.status);
    const info: TileInfo = { idx, x, y, claimed, id: "R" + pad(y + 1) + "·C" + pad(x + 1), num: idx + 1, mine: idx === myIdx };
    if (t && t.status === "published") { info.handle = t.name || "someone"; if (t.story) info.note = t.story; }
    else if (claimed) { info.handle = info.mine ? "you" : "—"; } // taken, not yet on the wall
    return info;
  };

  const artUrlFor = (idx: number) => { const t = byIdx.get(idx); return t && t.status === "published" && t.img && !t.img.startsWith("#") ? t.img : null; };
  return { GRID, TILE_PX, HI, N_TOTAL, bg: BG, accent: ACCENT, PAPER, palette: [], hi, recent: null, claimedCount, isClaimed, infoFor, artUrlFor };
}
