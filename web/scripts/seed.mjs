// Seed the canvas. Run: node --env-file=.env.local scripts/seed.mjs
// Idempotent: safe to re-run. Also doubles as a schema check.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"); process.exit(1); }

const db = createClient(url, key, { auth: { persistSession: false } });
const COLS = 24, ROWS = 24, SLUG = "what-home-looks-like";
const PALETTE = ["#C76B4A","#9C4A33","#E0A33E","#8A9A5B","#4F6F52","#6E94BE","#4E5C8A","#8A5A78","#20201D","#F3EAD6"];

// 1) Canvas (schema check happens here)
let { data: canvas, error: e1 } = await db.from("canvases").select("*").eq("slug", SLUG).maybeSingle();
if (e1) {
  console.error("\n❌ SCHEMA NOT FOUND:", e1.message);
  console.error("→ Run supabase/schema.sql in the Supabase SQL editor first, then re-run this seed.\n");
  process.exit(2);
}
if (!canvas) {
  const ins = await db.from("canvases").insert({
    slug: SLUG, title: "ekam.ink",
    theme_prompt: "where were you when home looked like this?",
    grid_cols: COLS, grid_rows: ROWS, palette: PALETTE, status: "open",
  }).select().single();
  if (ins.error) { console.error("canvas insert:", ins.error.message); process.exit(2); }
  canvas = ins.data; console.log("✓ canvas created", canvas.id);
} else console.log("✓ canvas exists", canvas.id);

// 2) 576 open tiles (idempotent upsert on the (canvas_id,x,y) unique key)
const { count } = await db.from("tiles").select("id", { count: "exact", head: true }).eq("canvas_id", canvas.id);
if ((count || 0) < COLS * ROWS) {
  const rows = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) rows.push({ canvas_id: canvas.id, x, y, status: "open" });
  const up = await db.from("tiles").upsert(rows, { onConflict: "canvas_id,x,y", ignoreDuplicates: true });
  if (up.error) { console.error("tiles upsert:", up.error.message); process.exit(2); }
  console.log("✓ tiles seeded:", rows.length);
} else console.log("✓ tiles exist:", count);

// 3) Disclosed founding tiles (published) so the canvas reads as alive.
// image_path holds a hex here as a placeholder until real 512px PNGs exist.
const FOUNDERS = [
  { x: 11, y: 6,  c: "#6E94BE", n: "Aanya",  s: "the train window on the way to nani’s",  l: "Brunswick, AU" },
  { x: 4,  y: 17, c: "#C76B4A", n: "Mickey",  s: "made this at 3am, missing my nani",       l: "Wyndham Vale, AU" },
  { x: 19, y: 3,  c: "#E0A33E", n: "Sam",     s: "mum’s kitchen, the yellow light",         l: "Footscray, AU" },
  { x: 7,  y: 21, c: "#8A9A5B", n: "Lee",     s: "our balcony in winter, the city humming", l: "Carlton, AU" },
  { x: 22, y: 14, c: "#8A5A78", n: "Priya",   s: "the rug we all sat on as kids",           l: "Tarneit, AU" },
  { x: 2,  y: 9,  c: "#4F6F52", n: "Theo",    s: "dad’s garden after the rain",             l: "Geelong, AU" },
  { x: 15, y: 19, c: "#9C4A33", n: "Noor",    s: "the brick wall i grew up against",        l: "Sunshine, AU" },
  { x: 9,  y: 2,  c: "#4E5C8A", n: "Eli",     s: "the night drive home down the M1",        l: "Werribee, AU" },
  { x: 20, y: 22, c: "#E0A33E", n: "Mia",     s: "grandma’s lamp, always on",               l: "Reservoir, AU" },
  { x: 13, y: 12, c: "#C76B4A", n: "Jay",     s: "the kettle, two cups, every morning",     l: "Preston, AU" },
];
let founded = 0;
for (const f of FOUNDERS) {
  const u = await db.from("tiles").update({
    status: "published", artist_name: f.n, artist_location: f.l, story: f.s,
    image_path: f.c, published_at: new Date().toISOString(),
  }).eq("canvas_id", canvas.id).eq("x", f.x).eq("y", f.y);
  if (u.error) console.error("founder", f.x, f.y, u.error.message); else founded++;
}
console.log("✓ founding tiles published:", founded);
console.log("\n✦ DONE — canvas is ready.");
