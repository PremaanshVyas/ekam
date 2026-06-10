/* Demo wall — procedural "society of styles" art, ported from the design handoff's
 * data.js (the README sanctions reusing it for marketing imagery). LANDING-ONLY,
 * decorative + clearly labelled as a preview. The live explorer renders real tiles.
 * Adapted to our 24×24 = 576 grid. Client-only (uses <canvas>). */

export type TileInfo = {
  idx: number; x: number; y: number; claimed: boolean; id: string; num: number;
  handle?: string; emailMasked?: string; day?: number; note?: string; mine?: boolean;
};

export type Wall = {
  GRID: number; TILE_PX: number; HI: number; N_TOTAL: number;
  bg: string; accent: string; PAPER: string; palette: string[];
  hi: HTMLCanvasElement | null; recent: HTMLCanvasElement | null;
  claimedCount: number;
  isClaimed: (idx: number) => boolean;
  infoFor: (idx: number) => TileInfo;
  artUrlFor?: (idx: number) => string | null; // full-res source for a published tile (real wall)
};

type Ctx = CanvasRenderingContext2D;
type Rng = () => number;

const PAPER = "#f4eee2";
const BG = "#16110d";
const ACCENT = "#e8643c";

// Studio swatches: mainstream colours first (true black/white/greys + a full
// primary→secondary spectrum), then curated earth & skin tones. Ordered so the
// picker reads as a logical grid. The custom "+" covers anything beyond these.
export const EDITOR_PALETTE = [
  // neutrals
  "#000000", "#555555", "#9a9a9a", "#c8c8c8", "#f4eee2", "#ffffff",
  // reds & oranges
  "#b3261e", "#e23b2e", "#e8643c", "#f5832a", "#f6a623",
  // yellows
  "#f7c948", "#ffe45e",
  // greens
  "#9bc53d", "#3fa34d", "#2e7d4f", "#176b5e",
  // teal & blues
  "#1aa6b7", "#3a9bdc", "#2a62cf", "#1e2f6b",
  // purples
  "#5a45c4", "#8e3fb8",
  // pinks & magenta
  "#c52a86", "#ef6fae", "#e8607a",
  // earth & skin
  "#6e4422", "#b07a3f", "#cf7a4f", "#e7b88c",
];

// ── rng / noise ──
function mulberry32(a: number): Rng {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 0x9e3779b1) | 0;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

const INKS = ["#221d18", "#a9472b", "#88975f", "#7195c9", "#96699c", "#2f5d46", "#e3a455", "#b5523a", "#50609c", "#c2563c", "#3e3a35", "#7e8a4f", "#d4738f", "#456a8c"];

function doodleWalk(g: Ctx, r: Rng, X: number, Y: number, T: number, col: string, w: number, steps: number) {
  g.strokeStyle = col; g.lineWidth = w;
  let x = X + T * (0.12 + r() * 0.76), y = Y + T * (0.12 + r() * 0.76);
  let a = r() * Math.PI * 2;
  const step = T * (0.05 + r() * 0.04);
  const wig = 0.8 + r() * 1.4;
  g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i < steps; i++) {
    a += (r() - 0.5) * wig;
    const dx = X + T / 2 - x, dy = Y + T / 2 - y;
    if (Math.hypot(dx, dy) > T * 0.5) { const ta = Math.atan2(dy, dx); a += Math.atan2(Math.sin(ta - a), Math.cos(ta - a)) * 0.5; }
    const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
    g.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    x = nx; y = ny;
  }
  g.stroke();
}
function doodleLoop(g: Ctx, r: Rng, cx: number, cy: number, rad: number, col: string, w: number, jit: number) {
  g.strokeStyle = col; g.lineWidth = w;
  const n = 10 + ((r() * 6) | 0); const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const aa = (i / n) * Math.PI * 2 + r() * 0.2;
    const rr = rad * (1 + (r() - 0.5) * jit);
    pts.push([cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr * (0.88 + r() * 0.24)]);
  }
  g.beginPath();
  g.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  g.closePath(); g.stroke();
}
function doodleBlob(g: Ctx, r: Rng, cx: number, cy: number, rad: number, col: string) {
  g.fillStyle = col; const n = 8; g.beginPath();
  for (let i = 0; i < n; i++) {
    const aa = (i / n) * Math.PI * 2; const rr = rad * (0.7 + r() * 0.6);
    const px = cx + Math.cos(aa) * rr, py = cy + Math.sin(aa) * rr;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath(); g.fill();
}
function jstroke(g: Ctx, r: Rng, pts: number[][], col: string, w: number, j: number, closed = false, fill = false) {
  const p = pts.map((q) => [q[0] + (r() - 0.5) * j, q[1] + (r() - 0.5) * j]);
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = w;
  const n = p.length; g.beginPath();
  if (closed) {
    g.moveTo((p[n - 1][0] + p[0][0]) / 2, (p[n - 1][1] + p[0][1]) / 2);
    for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    g.closePath();
  } else {
    g.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < n - 1; i++) { const a = p[i], b = p[i + 1]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    g.lineTo(p[n - 1][0], p[n - 1][1]);
  }
  if (fill) g.fill(); else g.stroke();
}

function motifSun(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const cx = X + T / 2 + (r() - 0.5) * T * 0.1, cy = Y + T / 2 + (r() - 0.5) * T * 0.1;
  const warm = cols.indexOf("#e3a455") >= 0 ? "#e3a455" : cols[0];
  doodleBlob(g, r, cx, cy, T * 0.15, warm);
  const rayCol = cols[1] || warm, n = 8 + ((r() * 5) | 0);
  g.strokeStyle = rayCol; g.lineWidth = w * 0.85;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.12; const r1 = T * 0.22, r2 = T * (0.32 + r() * 0.09);
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r1 + (r() - 0.5) * 2, cy + Math.sin(a) * r1 + (r() - 0.5) * 2);
    g.lineTo(cx + Math.cos(a) * r2 + (r() - 0.5) * 2, cy + Math.sin(a) * r2 + (r() - 0.5) * 2); g.stroke();
  }
}
function motifFlower(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const cx = X + T * (0.42 + r() * 0.16), cy = Y + T * (0.34 + r() * 0.1);
  jstroke(g, r, [[cx, cy + T * 0.1], [cx + (r() - 0.5) * 6, cy + T * 0.3], [cx + (r() - 0.5) * 8, Y + T * 0.92]], cols.indexOf("#88975f") >= 0 ? "#88975f" : "#2f5d46", w * 0.8, 1.5);
  const k = 5 + ((r() * 3) | 0), pc = cols[0];
  for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; doodleLoop(g, r, cx + Math.cos(a) * T * 0.14, cy + Math.sin(a) * T * 0.14, T * 0.1, pc, w * 0.8, 0.18); }
  doodleBlob(g, r, cx, cy, T * 0.07, cols[1] || "#e3a455");
}
function motifHeart(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const cx = X + T / 2, cy = Y + T * 0.44, s = T * 0.021 * (0.85 + r() * 0.3); const pts: number[][] = [];
  for (let i = 0; i < 26; i++) { const t = (i / 26) * Math.PI * 2; pts.push([cx + 16 * Math.pow(Math.sin(t), 3) * s, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s]); }
  jstroke(g, r, pts, cols[0], w, 1.6, true, r() < 0.5);
  if (r() < 0.4) doodleLoop(g, r, cx, cy + T * 0.02, T * 0.4, cols[1] || cols[0], w * 0.8, 0.14);
}
function motifHouse(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const cx = X + T / 2, base = Y + T * 0.82, hw = T * 0.42, top = Y + T * 0.42;
  jstroke(g, r, [[cx - hw / 2, base], [cx - hw / 2, top], [cx + hw / 2, top], [cx + hw / 2, base], [cx - hw / 2, base]], cols[0], w * 0.85, 1.6);
  jstroke(g, r, [[cx - hw / 2 - 3, top], [cx, Y + T * 0.16], [cx + hw / 2 + 3, top]], cols[1] || cols[0], w * 0.85, 1.6);
  jstroke(g, r, [[cx - T * 0.06, base], [cx - T * 0.06, base - T * 0.16], [cx + T * 0.06, base - T * 0.16], [cx + T * 0.06, base]], cols[2] || cols[0], w * 0.7, 1.2);
  if (r() < 0.6) doodleBlob(g, r, X + T * 0.82, Y + T * 0.18, T * 0.06, "#e3a455");
}
function motifMountains(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const base = Y + T * 0.72;
  jstroke(g, r, [[X + 2, base], [X + T * 0.28, Y + T * (0.3 + r() * 0.1)], [X + T * 0.5, base - T * 0.08], [X + T * 0.74, Y + T * (0.34 + r() * 0.1)], [X + T - 2, base]], cols[0], w * 0.9, 1.8);
  if (cols[1]) jstroke(g, r, [[X + 2, base + T * 0.12], [X + T * 0.4, base - T * 0.04], [X + T * 0.7, base + T * 0.1], [X + T - 2, base + T * 0.04]], cols[1], w * 0.8, 1.8);
  doodleBlob(g, r, X + T * (0.7 + r() * 0.14), Y + T * 0.17, T * 0.07, "#e3a455");
}
function motifRainbow(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const cx = X + T / 2, cy = Y + T * 0.8, k = Math.min(2 + ((r() * 3) | 0), cols.length);
  for (let i = 0; i < k; i++) {
    const rad = T * (0.2 + i * 0.105), pts: number[][] = [];
    for (let s = 0; s <= 12; s++) { const a = Math.PI + (s / 12) * Math.PI; pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
    jstroke(g, r, pts, cols[i], w * 0.9, 1.4);
  }
}
function motifSmiley(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const cx = X + T / 2, cy = Y + T / 2;
  doodleLoop(g, r, cx, cy, T * 0.34, cols[0], w, 0.1);
  doodleBlob(g, r, cx - T * 0.11, cy - T * 0.08, T * 0.035, cols[1] || cols[0]);
  doodleBlob(g, r, cx + T * 0.11, cy - T * 0.08, T * 0.035, cols[1] || cols[0]);
  const pts: number[][] = [];
  for (let s = 0; s <= 8; s++) { const a = 0.25 * Math.PI + (s / 8) * 0.5 * Math.PI; pts.push([cx + Math.cos(a) * T * 0.17, cy + Math.sin(a) * T * 0.17]); }
  jstroke(g, r, pts, cols[1] || cols[0], w * 0.8, 1);
}
function motifStar(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const cx = X + T / 2, cy = Y + T / 2, pts: number[][] = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const rad = (i % 2 === 0 ? T * 0.38 : T * 0.16) * (0.95 + r() * 0.1); pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
  jstroke(g, r, pts, cols[0], w * 0.9, 1.6, true, r() < 0.4);
  if (r() < 0.5) doodleBlob(g, r, cx, cy, T * 0.05, cols[1] || cols[0]);
}
function motifStripes(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const n = 4 + ((r() * 3) | 0), dir = r();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, col = cols[i % cols.length], pts: number[][] = [];
    for (let s = 0; s <= 5; s++) {
      const u = s / 5;
      if (dir < 0.4) pts.push([X + 3 + u * (T - 6), Y + t * T]);
      else if (dir < 0.7) pts.push([X + t * T, Y + 3 + u * (T - 6)]);
      else pts.push([X + u * T * 1.2 - T * 0.1, Y + t * T * 1.4 - u * T * 0.55]);
    }
    jstroke(g, r, pts, col, w * (0.85 + r() * 0.3), 1.8);
  }
}
function motifDots(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[]) {
  const k = 3 + ((r() * 2) | 0), cell = T / (k + 1);
  for (let yy = 1; yy <= k; yy++) for (let xx = 1; xx <= k; xx++) doodleBlob(g, r, X + xx * cell + (r() - 0.5) * 3, Y + yy * cell + (r() - 0.5) * 3, T * (0.045 + r() * 0.025), cols[(xx + yy) % cols.length]);
}
function motifTarget(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const cx = X + T / 2, cy = Y + T / 2, k = 3 + ((r() * 2) | 0);
  for (let i = k; i >= 1; i--) doodleLoop(g, r, cx, cy, T * 0.4 * (i / k), cols[(k - i) % cols.length], w * 0.9, 0.1);
  if (r() < 0.6) doodleBlob(g, r, cx, cy, T * 0.05, cols[k % cols.length]);
}
function motifSpiral(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number, loose: boolean) {
  const cx = X + T / 2, cy = Y + T / 2, turns = 2.2 + r() * 1.6, amax = turns * Math.PI * 2, pts: number[][] = [];
  for (let a = 0; a < amax; a += 0.45) pts.push([cx + Math.cos(a) * T * 0.42 * (a / amax), cy + Math.sin(a) * T * 0.42 * (a / amax)]);
  jstroke(g, r, pts, cols[0], w * 0.9, loose ? 3.2 : 1.2);
}
function motifWaves(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const rows = 3 + ((r() * 2) | 0), ph = r() * 6;
  for (let i = 0; i < rows; i++) {
    const yy = Y + T * ((i + 0.7) / (rows + 0.6)), pts: number[][] = [];
    for (let s = 0; s <= 10; s++) { const u = s / 10; pts.push([X + 2 + u * (T - 4), yy + Math.sin(u * Math.PI * (2 + r() * 0.5) + ph + i) * T * 0.05]); }
    jstroke(g, r, pts, cols[i % cols.length], w * 0.9, 1.4);
  }
}
function motifZigzag(g: Ctx, r: Rng, X: number, Y: number, T: number, cols: string[], w: number) {
  const n = 2 + ((r() * 2) | 0);
  for (let k = 0; k < n; k++) {
    const pts: number[][] = []; const yy = Y + T * (0.2 + r() * 0.6); const segs = 4 + ((r() * 3) | 0);
    for (let s = 0; s <= segs; s++) pts.push([X + (s / segs) * T, yy + (s % 2 ? -1 : 1) * T * (0.08 + r() * 0.1)]);
    jstroke(g, r, pts, cols[k % cols.length], w * (0.8 + r() * 0.4), 2.2);
  }
}

const ART_PALETTES = [
  ["#2b2a4a", "#6f4d7e", "#c26a6a", "#e8a06a", "#f4d8a8"],
  ["#1f3a4d", "#2f6478", "#5fa8a0", "#a8cfc0", "#eee9da"],
  ["#23403a", "#3e6b4f", "#7e8a4f", "#c9b97e", "#eee4c8"],
  ["#3a2440", "#8a3a52", "#c2563c", "#e3a455", "#f2d3a0"],
  ["#27304a", "#4a5d8a", "#8a9bbf", "#d8d4c8", "#f0e8d8"],
];
function hexrgb(h: string) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function mixc(a: string, b: string, t: number) { const A = hexrgb(a), B = hexrgb(b); return "rgb(" + Math.round(A[0] + (B[0] - A[0]) * t) + "," + Math.round(A[1] + (B[1] - A[1]) * t) + "," + Math.round(A[2] + (B[2] - A[2]) * t) + ")"; }
function paintWash(g: Ctx, r: Rng, X: number, Y: number, T: number, f0: number, f1: number, c0: string, c1: string) {
  const H = (f1 - f0) * T, rows = 8 + ((r() * 4) | 0);
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1), yy = Y + f0 * T + t * H;
    g.strokeStyle = mixc(c0, c1, t); g.lineWidth = (H / rows) * 1.7;
    g.beginPath(); g.moveTo(X - 2, yy + (r() - 0.5) * 1.6); g.quadraticCurveTo(X + T / 2, yy + (r() - 0.5) * 2.6, X + T + 2, yy + (r() - 0.5) * 1.6); g.stroke();
  }
}
function ridgeFill(g: Ctx, r: Rng, X: number, Y: number, T: number, baseF: number, ampF: number, col: string) {
  g.fillStyle = col; g.beginPath(); g.moveTo(X - 2, Y + T + 2); g.lineTo(X - 2, Y + baseF * T + (r() - 0.5) * 3);
  const segs = 4 + ((r() * 3) | 0);
  for (let s = 1; s <= segs; s++) { const u = s / segs; g.lineTo(X + u * T + (r() - 0.5) * 4, Y + baseF * T - (s % 2 ? 1 : 0.35) * ampF * T * (0.5 + r() * 0.8)); }
  g.lineTo(X + T + 2, Y + baseF * T + (r() - 0.5) * 3); g.lineTo(X + T + 2, Y + T + 2); g.closePath(); g.fill();
}
function leafFill(g: Ctx, r: Rng, x: number, y: number, ang: number, len: number, col: string) {
  const wid = len * (0.3 + r() * 0.12); g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -wid, len, 0); g.quadraticCurveTo(len * 0.5, wid, 0, 0); g.closePath(); g.fill(); g.restore();
}
function birdMark(g: Ctx, x: number, y: number, s: number, col: string) {
  g.strokeStyle = col; g.lineWidth = s * 0.45; g.beginPath();
  g.moveTo(x - s, y); g.quadraticCurveTo(x - s * 0.4, y - s * 0.9, x, y); g.moveTo(x, y); g.quadraticCurveTo(x + s * 0.4, y - s * 0.9, x + s, y); g.stroke();
}
function artMountains(g: Ctx, r: Rng, X: number, Y: number, T: number, P: string[]) {
  paintWash(g, r, X, Y, T, 0, 0.6, P[0], P[3]);
  g.fillStyle = P[4]; g.beginPath(); g.arc(X + T * (0.28 + r() * 0.44), Y + T * (0.16 + r() * 0.16), T * (0.06 + r() * 0.045), 0, 7); g.fill();
  ridgeFill(g, r, X, Y, T, 0.5, 0.16, mixc(P[2], P[3], 0.45)); ridgeFill(g, r, X, Y, T, 0.64, 0.13, P[1]); ridgeFill(g, r, X, Y, T, 0.8, 0.1, P[0]);
}
function artMoonBirds(g: Ctx, r: Rng, X: number, Y: number, T: number, P: string[]) {
  paintWash(g, r, X, Y, T, 0, 1, P[0], P[1]);
  const mx = X + T * (0.3 + r() * 0.4), my = Y + T * (0.24 + r() * 0.16), mr = T * (0.1 + r() * 0.05);
  g.fillStyle = P[4]; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
  g.globalAlpha = 0.25; g.fillStyle = P[1];
  g.beginPath(); g.arc(mx - mr * 0.3, my + mr * 0.2, mr * 0.22, 0, 7); g.fill(); g.beginPath(); g.arc(mx + mr * 0.35, my - mr * 0.25, mr * 0.15, 0, 7); g.fill(); g.globalAlpha = 1;
  ridgeFill(g, r, X, Y, T, 0.82, 0.07, mixc(P[0], "#16110d", 0.4));
  const nb = 3 + ((r() * 3) | 0);
  for (let i = 0; i < nb; i++) birdMark(g, X + T * (0.18 + r() * 0.64), Y + T * (0.18 + r() * 0.4), T * (0.035 + r() * 0.02), mixc(P[0], "#16110d", 0.5));
}
function artBotanical(g: Ctx, r: Rng, X: number, Y: number, T: number, P: string[]) {
  const green = P === ART_PALETTES[2] ? P[1] : "#3e6b4f"; const x0 = X + T * (0.44 + r() * 0.12); const pts: number[][] = []; const lean = (r() - 0.5) * T * 0.3;
  for (let i = 0; i <= 7; i++) { const u = i / 7; pts.push([x0 + Math.sin(u * Math.PI * (0.8 + r() * 0.4)) * T * 0.08 + lean * u, Y + T * (0.92 - u * 0.78)]); }
  jstroke(g, r, pts, green, T * 0.035, 1);
  for (let i = 2; i <= 6; i++) { const p = pts[i], side = i % 2 ? 1 : -1; const stemAng = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]); leafFill(g, r, p[0], p[1], stemAng + side * (0.7 + r() * 0.4), T * (0.14 + r() * 0.08), mixc(green, P[3], r() * 0.35)); }
  if (r() < 0.6) { const top = pts[7]; for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; doodleBlob(g, r, top[0] + Math.cos(a) * T * 0.05, top[1] + Math.sin(a) * T * 0.05, T * 0.035, P[2]); } doodleBlob(g, r, top[0], top[1], T * 0.028, P[3]); }
}
function artAbstract(g: Ctx, r: Rng, X: number, Y: number, T: number, P: string[]) {
  g.globalAlpha = 0.82; const k = 3 + ((r() * 2) | 0);
  for (let i = 0; i < k; i++) doodleBlob(g, r, X + T * (0.22 + r() * 0.56), Y + T * (0.22 + r() * 0.56), T * (0.14 + r() * 0.12), P[1 + ((r() * 3) | 0)]);
  g.globalAlpha = 1; const pts: number[][] = [];
  for (let s = 0; s <= 8; s++) { const a = Math.PI * (0.9 + (s / 8) * 0.9); pts.push([X + T / 2 + Math.cos(a) * T * 0.36, Y + T * 0.55 + Math.sin(a) * T * 0.32]); }
  jstroke(g, r, pts, P[0], T * 0.03, 1.2);
  if (r() < 0.5) doodleBlob(g, r, X + T * (0.25 + r() * 0.5), Y + T * (0.25 + r() * 0.5), T * 0.04, P[0]);
}
function artBauhaus(g: Ctx, r: Rng, X: number, Y: number, T: number, P: string[]) {
  g.fillStyle = P[4]; g.fillRect(X, Y, T, T);
  g.fillStyle = P[2]; g.beginPath(); g.arc(X + T * (0.34 + r() * 0.2), Y + T * (0.32 + r() * 0.14), T * (0.2 + r() * 0.06), 0, 7); g.fill();
  g.fillStyle = P[1]; g.beginPath(); g.arc(X + T * (0.6 + r() * 0.12), Y + T * 0.66, T * (0.16 + r() * 0.05), Math.PI, 0); g.closePath(); g.fill();
  g.fillStyle = P[0]; g.beginPath();
  const tx = X + T * (0.16 + r() * 0.1), ty = Y + T * (0.66 + r() * 0.1), ts = T * (0.16 + r() * 0.06);
  g.moveTo(tx, ty + ts); g.lineTo(tx + ts * 0.6, ty - ts * 0.4); g.lineTo(tx + ts * 1.2, ty + ts); g.closePath(); g.fill();
  g.strokeStyle = P[3]; g.lineWidth = T * 0.028; g.beginPath(); g.moveTo(X + T * 0.12, Y + T * (0.14 + r() * 0.08)); g.lineTo(X + T * 0.88, Y + T * (0.12 + r() * 0.08)); g.stroke();
}
function artSea(g: Ctx, r: Rng, X: number, Y: number, T: number, P: string[]) {
  paintWash(g, r, X, Y, T, 0, 0.34, P[3], P[4]); paintWash(g, r, X, Y, T, 0.34, 1, P[2], P[0]);
  g.strokeStyle = P[4]; g.lineWidth = T * 0.035; const nw = 2 + ((r() * 2) | 0);
  for (let i = 0; i < nw; i++) { const wx = X + T * (0.2 + r() * 0.5), wy = Y + T * (0.48 + i * 0.2 + r() * 0.08), ws = T * (0.1 + r() * 0.06); g.beginPath(); g.arc(wx, wy, ws, Math.PI * 1.1, Math.PI * 1.9); g.arc(wx + ws * 1.1, wy, ws * 0.55, Math.PI * 1.2, Math.PI * 0.2); g.stroke(); }
}
function artSunsetWater(g: Ctx, r: Rng, X: number, Y: number, T: number, P: string[]) {
  paintWash(g, r, X, Y, T, 0, 0.55, P[0], P[2]);
  const sx = X + T * (0.34 + r() * 0.3), sy = Y + T * 0.52, sr = T * (0.08 + r() * 0.05);
  g.fillStyle = P[4]; g.beginPath(); g.arc(sx, sy, sr, Math.PI, 0); g.closePath(); g.fill();
  paintWash(g, r, X, Y, T, 0.55, 1, P[1], mixc(P[0], "#16110d", 0.3));
  g.strokeStyle = P[4];
  for (let i = 0; i < 5; i++) { const u = i / 5, ww = sr * (1.6 - u); g.lineWidth = T * (0.035 - u * 0.022); g.globalAlpha = 0.85 - u * 0.5; const yy = sy + T * 0.08 + u * T * 0.3; g.beginPath(); g.moveTo(sx - ww + (r() - 0.5) * 4, yy); g.lineTo(sx + ww + (r() - 0.5) * 4, yy); g.stroke(); }
  g.globalAlpha = 1;
}

function drawTileArt(g: Ctx, X: number, Y: number, T: number, seed: number) {
  const r = mulberry32(((seed + 1) * 2654435761) >>> 0);
  const cx = X + T / 2 + (r() - 0.5) * T * 0.18, cy = Y + T / 2 + (r() - 0.5) * T * 0.18;
  g.save(); g.beginPath(); g.rect(X, Y, T, T); g.clip();
  g.imageSmoothingEnabled = true; g.lineCap = "round"; g.lineJoin = "round";
  g.fillStyle = PAPER; g.fillRect(X, Y, T, T);
  const pool = INKS.slice(); const nCols = 2 + ((r() * 3.4) | 0); const cols: string[] = [];
  for (let i = 0; i < nCols && pool.length; i++) cols.push(pool.splice((r() * pool.length) | 0, 1)[0]);
  const baseW = T * (0.05 + r() * 0.035); const pat = r();
  void cx; void cy;
  if (pat < 0.24) {
    const sub = r();
    if (sub < 0.4) {
      const rings = 2 + ((r() * 3) | 0);
      for (let i = rings; i >= 1; i--) doodleLoop(g, r, cx, cy, T * 0.42 * (i / rings) * (0.85 + r() * 0.25), cols[(rings - i) % cols.length], baseW * (0.85 + r() * 0.4), 0.45 + r() * 0.45);
      if (r() < 0.7) doodleBlob(g, r, cx, cy, T * (0.05 + r() * 0.04), cols[(r() * cols.length) | 0]);
      if (r() < 0.4) doodleWalk(g, r, X, Y, T, cols[(r() * cols.length) | 0], baseW * 0.9, 30 + ((r() * 40) | 0));
    } else if (sub < 0.75) {
      const n = 2 + ((r() * 3) | 0);
      for (let s = 0; s < n; s++) doodleWalk(g, r, X, Y, T, cols[s % cols.length], baseW * (0.8 + r() * 0.5), 36 + ((r() * 70) | 0));
      if (r() < 0.35) doodleBlob(g, r, X + T * (0.25 + r() * 0.5), Y + T * (0.25 + r() * 0.5), T * (0.04 + r() * 0.04), cols[(r() * cols.length) | 0]);
    } else {
      doodleWalk(g, r, X, Y, T, cols[0], baseW, 80 + ((r() * 60) | 0));
      if (cols.length > 1) doodleWalk(g, r, X, Y, T, cols[1], baseW * 0.95, 50 + ((r() * 50) | 0));
      const rings = 2 + ((r() * 2) | 0);
      for (let i = rings; i >= 1; i--) doodleLoop(g, r, cx, cy, T * 0.34 * (i / rings), cols[(2 + rings - i) % cols.length], baseW * 0.95, 0.5 + r() * 0.4);
      if (r() < 0.7) doodleBlob(g, r, cx, cy, T * (0.045 + r() * 0.035), cols[(r() * cols.length) | 0]);
    }
  } else if (pat < 0.54) {
    const m = (r() * 11) | 0;
    if (m === 0) motifSun(g, r, X, Y, T, cols, baseW);
    else if (m === 1) motifFlower(g, r, X, Y, T, cols, baseW);
    else if (m === 2) motifHeart(g, r, X, Y, T, cols, baseW);
    else if (m === 3) motifHouse(g, r, X, Y, T, cols, baseW);
    else if (m === 4) motifMountains(g, r, X, Y, T, cols, baseW);
    else if (m === 5) motifRainbow(g, r, X, Y, T, cols, baseW);
    else if (m === 6) motifSmiley(g, r, X, Y, T, cols, baseW);
    else if (m === 7) motifStar(g, r, X, Y, T, cols, baseW);
    else if (m === 8) motifStripes(g, r, X, Y, T, cols, baseW);
    else if (m === 9) motifDots(g, r, X, Y, T, cols);
    else motifTarget(g, r, X, Y, T, cols, baseW);
  } else if (pat < 0.77) {
    const m = (r() * 6) | 0;
    if (m === 0) motifSpiral(g, r, X, Y, T, cols, baseW, true);
    else if (m === 1) motifWaves(g, r, X, Y, T, cols, baseW);
    else if (m === 2) motifZigzag(g, r, X, Y, T, cols, baseW);
    else if (m === 3) { doodleWalk(g, r, X, Y, T, cols[cols.length - 1], baseW * 0.8, 30 + ((r() * 30) | 0)); if (r() < 0.5) motifStar(g, r, X, Y, T, cols, baseW); else motifHeart(g, r, X, Y, T, cols, baseW); }
    else if (m === 4) { const k = 2 + ((r() * 2) | 0); for (let i = 0; i < k; i++) doodleBlob(g, r, X + T * (0.2 + r() * 0.6), Y + T * (0.2 + r() * 0.6), T * (0.1 + r() * 0.09), cols[i % cols.length]); doodleWalk(g, r, X, Y, T, cols[0], baseW * 0.8, 30 + ((r() * 30) | 0)); }
    else { motifSpiral(g, r, X, Y, T, cols, baseW, false); if (r() < 0.5) doodleLoop(g, r, cx, cy, T * 0.42, cols[1] || cols[0], baseW * 0.85, 0.3); }
  } else {
    const P = ART_PALETTES[(r() * ART_PALETTES.length) | 0]; const m = (r() * 7) | 0;
    if (m === 0) artMountains(g, r, X, Y, T, P);
    else if (m === 1) artMoonBirds(g, r, X, Y, T, P);
    else if (m === 2) artBotanical(g, r, X, Y, T, P);
    else if (m === 3) artAbstract(g, r, X, Y, T, P);
    else if (m === 4) artBauhaus(g, r, X, Y, T, P);
    else if (m === 5) artSea(g, r, X, Y, T, P);
    else artSunsetWater(g, r, X, Y, T, P);
  }
  g.restore();
}

const NAMES = ["mira", "kenji", "asha", "leo", "noor", "tomas", "yuki", "ada", "rafa", "sol", "iris", "kai", "lena", "omar", "vera", "finn", "maya", "theo", "zara", "elio", "juno", "nadia", "cyrus", "wren", "esme", "dario", "lucia", "ravi", "noa", "soren", "bea", "pia"];
const DOMAINS = ["gmail.com", "proton.me", "icloud.com", "hey.com", "me.com"];
const NOTES = [
  "first thing I've ever drawn for strangers to see.", "a tiny window from my desk. hi everyone.", "made this for my sister. she'll know which one.",
  "eight minutes, one little ghost.", "proof I was here on this canvas, this week.", "tried to draw the sky. got a blob. love it anyway.",
  "my cat, abstracted heavily.", "no plan. just colors I like.", "the smallest art I'll ever make in public.",
  "found my neighbours by accident — say hi to them too.", "a little sun for the dark corner of the wall.", "drew this at 2am and I stand by it.",
  "hello from the edge of the canvas.", "one line at a time, like everything.",
];

// Build a demo wall at the given grid size (default 24×24 = our 576).
export function createDemoWall(GRID = 24, fillPct = 0.7): Wall {
  const TILE_PX = 96, HI = GRID * TILE_PX, N_TOTAL = GRID * GRID;
  const claimedCount = Math.round(fillPct * N_TOTAL);

  // organic claim ordering (clusters via noise)
  const scoreRank = new Int32Array(N_TOTAL);
  const arr: [number, number][] = [];
  for (let i = 0; i < N_TOTAL; i++) { const x = i % GRID, y = (i / GRID) | 0; const score = vnoise(x / 4.5, y / 4.5, 31) * 0.8 + hash(x, y, 12) * 0.4; arr.push([i, -score]); }
  arr.sort((a, b) => a[1] - b[1]);
  arr.forEach((e, rank) => { scoreRank[e[0]] = rank; });
  const isClaimed = (idx: number) => scoreRank[idx] < claimedCount;

  function ownerFor(idx: number) {
    const x = idx % GRID, y = (idx / GRID) | 0;
    const f = NAMES[Math.floor(hash(x, y, 1) * NAMES.length) % NAMES.length];
    const tag = Math.floor(hash(x, y, 6) * 90 + 10);
    const dom = DOMAINS[Math.floor(hash(x, y, 7) * DOMAINS.length) % DOMAINS.length];
    const email = `${f}${hash(x, y, 8) < 0.5 ? tag : ""}@${dom}`;
    const masked = email[0] + "•••••@" + dom;
    const day = Math.floor(hash(x, y, 3) * 13);
    const note = NOTES[Math.floor(hash(x, y, 4) * NOTES.length) % NOTES.length];
    return { handle: f, emailMasked: masked, day, note };
  }

  const hi = document.createElement("canvas"); hi.width = HI; hi.height = HI;
  const g = hi.getContext("2d")!; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.fillStyle = BG; g.fillRect(0, 0, HI, HI);
  for (let i = 0; i < N_TOTAL; i++) { if (!isClaimed(i)) continue; const x = i % GRID, y = (i / GRID) | 0; drawTileArt(g, x * TILE_PX, y * TILE_PX, TILE_PX, i); }

  // recency heatmap (last ~70 claims) for the "Activity" view mode
  const recent = document.createElement("canvas"); recent.width = GRID; recent.height = GRID;
  const rg = recent.getContext("2d")!; const win = 70, start = Math.max(0, claimedCount - win);
  for (let i = 0; i < N_TOTAL; i++) { const rk = scoreRank[i]; if (rk >= start && rk < claimedCount) { const a = (rk - start) / win, x = i % GRID, y = (i / GRID) | 0; rg.fillStyle = `rgba(232,100,60,${0.18 + a * 0.66})`; rg.fillRect(x, y, 1, 1); } }

  const infoFor = (idx: number): TileInfo => {
    const x = idx % GRID, y = (idx / GRID) | 0; const claimed = isClaimed(idx);
    const info: TileInfo = { idx, x, y, claimed, id: "R" + String(y + 1).padStart(2, "0") + "·C" + String(x + 1).padStart(2, "0"), num: idx + 1 };
    if (claimed) Object.assign(info, ownerFor(idx));
    return info;
  };

  return { GRID, TILE_PX, HI, N_TOTAL, bg: BG, accent: ACCENT, PAPER, palette: EDITOR_PALETTE, hi, recent, claimedCount, isClaimed, infoFor };
}
