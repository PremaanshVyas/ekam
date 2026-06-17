// Full launch reset — take the canvas to a clean public starting state.
// DRY-RUN BY DEFAULT. Nothing is written unless you pass --yes.
//
//   node --env-file=.env.local scripts/launch-reset.mjs                 → dry run, empty-slate plan
//   node --env-file=.env.local scripts/launch-reset.mjs --keep-real     → dry run, keep the real painted tiles
//   node --env-file=.env.local scripts/launch-reset.mjs --yes           → COMMIT empty slate
//   node --env-file=.env.local scripts/launch-reset.mjs --keep-real --yes --purge-storage
//
// Flags:
//   --keep-real       keep published tiles that have a real PNG (image_path not '#...'); wipe the rest
//   --purge-storage   also delete every storage object not referenced by a kept tile
//   --yes             actually perform the writes (otherwise dry run)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const args = new Set(process.argv.slice(2));
const COMMIT = args.has("--yes");
const KEEP_REAL = args.has("--keep-real");
const PURGE_STORAGE = args.has("--purge-storage");
const tag = COMMIT ? "COMMIT" : "DRY RUN";

const OPEN = {
  status: "open",
  artist_name: null, artist_email: null, artist_user_id: null, artist_location: null, story: null,
  image_path: null, thumb_path: null,
  claimed_at: null, claim_expires_at: null, published_at: null,
  pending_image_path: null, pending_story: null, pending_submitted_at: null,
  draft_image_path: null, draft_story: null, draft_updated_at: null,
  ai_verdict: null, ai_reason: null, ai_checked_at: null,
  review_requested_at: null, expiry_warned_at: null,
};

console.log(`\n[${tag}] launch reset — ${KEEP_REAL ? "KEEP real painted tiles" : "EMPTY slate"}${PURGE_STORAGE ? " + purge storage" : ""}\n`);

// Which published tiles (if any) do we preserve?
const { data: published } = await db.from("tiles").select("id, x, y, image_path, thumb_path, artist_name").eq("status", "published");
const keep = KEEP_REAL ? (published || []).filter((t) => t.image_path && !t.image_path.startsWith("#")) : [];
const keepIds = new Set(keep.map((t) => t.id));
const keepPaths = new Set(keep.flatMap((t) => [t.image_path, t.thumb_path].filter(Boolean)));

console.log(`tiles to preserve: ${keep.length}${keep.length ? " → " + keep.map((t) => `R${t.y + 1}C${t.x + 1}(${t.artist_name || "?"})`).join(", ") : ""}`);

// Count what will be reset
const { count: toReset } = await db.from("tiles").select("id", { count: "exact", head: true }).not("status", "eq", "open");
const resetN = keepIds.size ? (toReset || 0) - keep.length : (toReset || 0);
console.log(`tiles to reset → open: ~${resetN}`);
for (const tbl of ["tile_votes", "notifications", "moderation_log"]) {
  const { count } = await db.from(tbl).select("*", { count: "exact", head: true });
  console.log(`${tbl}: delete ${count} rows`);
}

if (!COMMIT) {
  console.log(`\n(dry run — nothing written. Re-run with --yes to commit.)\n`);
  process.exit(0);
}

// 1) Reset tiles (everything except preserved ones)
let q = db.from("tiles").update(OPEN).neq("status", "open");
if (keepIds.size) q = q.not("id", "in", `(${[...keepIds].join(",")})`);
const r1 = await q.select("id");
if (r1.error) { console.error("✗ tile reset:", r1.error.message); process.exit(2); }
console.log(`✓ reset ${r1.data.length} tiles to open`);

// 2) Delete votes / notifications / moderation_log (keep votes/log for preserved tiles)
const delVotes = keepIds.size
  ? db.from("tile_votes").delete().not("tile_id", "in", `(${[...keepIds].join(",")})`)
  : db.from("tile_votes").delete().not("tile_id", "is", null);
await delVotes;
await db.from("notifications").delete().not("id", "is", null);
const delLog = keepIds.size
  ? db.from("moderation_log").delete().not("tile_id", "in", `(${[...keepIds].join(",")})`)
  : db.from("moderation_log").delete().not("id", "is", null);
await delLog;
console.log("✓ cleared votes, notifications, moderation log");

// 3) Optionally purge orphaned storage objects
if (PURGE_STORAGE) {
  const { data: objs, error } = await db.storage.from("tiles").list("", { limit: 2000 });
  if (error) console.error("storage list:", error.message);
  else {
    const trash = objs.map((o) => o.name).filter((name) => !keepPaths.has(name));
    for (let i = 0; i < trash.length; i += 100) {
      const batch = trash.slice(i, i + 100);
      const { error: de } = await db.storage.from("tiles").remove(batch);
      if (de) console.error("storage remove:", de.message);
    }
    console.log(`✓ purged ${trash.length} storage objects (kept ${keepPaths.size})`);
  }
}

console.log("\n✦ DONE — canvas is at its public starting state.\n");
