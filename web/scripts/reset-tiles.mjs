// Reset tiles back to "open" for testing (frees the tile + the artist email).
//   node --env-file=.env.local scripts/reset-tiles.mjs                 → reset ALL tiles
//   node --env-file=.env.local scripts/reset-tiles.mjs a@x.com b@y.com → reset only those emails
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const emails = process.argv.slice(2).map((s) => s.toLowerCase()).filter(Boolean);

const RESET = {
  status: "open",
  artist_name: null, artist_email: null, artist_user_id: null, artist_location: null,
  story: null, image_path: null, thumb_path: null,
  claimed_at: null, claim_expires_at: null, published_at: null,
  pending_image_path: null, pending_story: null, pending_submitted_at: null,
};

async function run(patch) {
  let q = db.from("tiles").update(patch);
  q = emails.length ? q.in("artist_email", emails) : q.not("id", "is", null); // PostgREST needs a filter
  return q.select("id");
}

console.log(emails.length ? `Resetting tiles for: ${emails.join(", ")}` : "Resetting ALL tiles to open.");
let { data, error } = await run(RESET);

// Fall back if migration 0003 (pending_* columns) hasn't been run yet.
if (error && /pending_/.test(error.message)) {
  const safe = { ...RESET };
  delete safe.pending_image_path; delete safe.pending_story; delete safe.pending_submitted_at;
  ({ data, error } = await run(safe));
  if (!error) console.log("(note: pending_* columns not found — run migration 0003 to enable tile edits)");
}

if (error) { console.error("✗ reset failed:", error.message); process.exit(2); }
console.log(`✓ reset ${data.length} tiles to open. The canvas is clear and those emails can claim again.`);
