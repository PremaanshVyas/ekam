// Mock tile data for the canvas demo. In production these come from Supabase
// (the `public_tiles` view — see supabase/schema.sql). Painted tiles use the
// constrained palette only; each carries an artist name + one-line story.

export const PALETTE = [
  "--palette-clay", "--palette-rust", "--palette-honey", "--palette-sage",
  "--palette-pine", "--palette-sky", "--palette-dusk", "--palette-plum", "--palette-ink",
];

const STORIES = [
  { story: "made this at 3am, missing my nani", name: "Mickey" },
  { story: "the train window on the way to nani’s", name: "Aanya" },
  { story: "mum’s kitchen, the yellow light", name: "Sam" },
  { story: "our balcony in winter, the city humming", name: "Lee" },
  { story: "the rug we all sat on as kids", name: "Priya" },
];

export type Tile = {
  x: number;
  y: number;
  painted: boolean;
  color?: string; // a CSS custom-property name from PALETTE
  story?: string;
  name?: string;
};

// Deterministic PRNG so the demo canvas is stable across renders/SSR.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function makeTiles(cols = 24, rows = 24, fill = 0.4): Tile[] {
  const r = rng(42);
  const out: Tile[] = [];
  let k = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (r() < fill) {
        const color = PALETTE[Math.floor(r() * PALETTE.length)];
        const st = STORIES[k++ % STORIES.length];
        out.push({ x, y, painted: true, color, story: st.story, name: st.name });
      } else {
        out.push({ x, y, painted: false });
      }
    }
  }
  return out;
}
