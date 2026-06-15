// Pre-flight launch readiness check (READ-ONLY — mutates nothing).
//   node --env-file=.env.local scripts/launch-check.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const ok = (b) => (b ? "✓" : "✗");
const colExists = async (table, col) => {
  const { error } = await db.from(table).select(col, { head: true, count: "exact" }).limit(1);
  return !(error && /column .* does not exist/i.test(error.message));
};

console.log("── ekam.ink launch readiness ─────────────────────────────");

// Canvas + deadline (migration 0008)
const { data: canvas } = await db.from("canvases").select("*").maybeSingle();
console.log(`\ncanvas: slug=${canvas?.slug}  ${canvas?.grid_cols}×${canvas?.grid_rows}  status=${canvas?.status}`);
const hasClosesAt = await colExists("canvases", "closes_at");
const closesAt = hasClosesAt ? canvas?.closes_at : "(column missing)";
console.log(`${ok(hasClosesAt && !!canvas?.closes_at)} 0008 closes_at: ${closesAt}`);
const hasWarned = await colExists("tiles", "expiry_warned_at");
console.log(`${ok(hasWarned)} 0008 tiles.expiry_warned_at column present`);

// Tile status breakdown
const n = async (q) => (await q).count ?? 0;
const total   = await n(db.from("tiles").select("id", { count: "exact", head: true }));
const open    = await n(db.from("tiles").select("id", { count: "exact", head: true }).eq("status", "open"));
const claimed = await n(db.from("tiles").select("id", { count: "exact", head: true }).eq("status", "claimed"));
const pending = await n(db.from("tiles").select("id", { count: "exact", head: true }).eq("status", "pending"));
const pub     = await n(db.from("tiles").select("id", { count: "exact", head: true }).eq("status", "published"));
console.log(`\ntiles: ${total} total → open ${open} | claimed ${claimed} | pending ${pending} | published ${pub}`);

// Founders (hex placeholder) vs real PNG paintings
const { data: published } = await db.from("tiles").select("image_path, artist_name").eq("status", "published");
const founders = (published || []).filter((t) => (t.image_path || "").startsWith("#"));
const realArt  = (published || []).filter((t) => t.image_path && !t.image_path.startsWith("#"));
console.log(`  ├─ seeded founders (flat hex, fake stories): ${founders.length}`);
console.log(`  └─ real painted PNGs: ${realArt.length}`);

// Leftover test data that a reset must also clear
for (const tbl of ["tile_votes", "notifications", "moderation_log"]) {
  const { count, error } = await db.from(tbl).select("*", { count: "exact", head: true });
  console.log(`${error ? "?" : ok(true)} ${tbl}: ${error ? error.message : count + " rows"}`);
}

// Drafts / stale AI state still sitting on tiles
const draftCol = await colExists("tiles", "draft_image_path");
if (draftCol) {
  const drafts = await n(db.from("tiles").select("id", { count: "exact", head: true }).not("draft_image_path", "is", null));
  console.log(`• tiles carrying a saved draft: ${drafts}`);
}
const verdicts = await n(db.from("tiles").select("id", { count: "exact", head: true }).not("ai_verdict", "is", null));
console.log(`• tiles carrying an AI verdict: ${verdicts}`);

// Storage objects in the tiles bucket (orphans after reset)
const { data: bucket, error: be } = await db.storage.from("tiles").list("", { limit: 1000 });
console.log(`• storage 'tiles' bucket objects (root): ${be ? be.message : (bucket?.length ?? 0)}`);

console.log("\n──────────────────────────────────────────────────────────");
