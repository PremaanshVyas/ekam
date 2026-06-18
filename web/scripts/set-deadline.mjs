// Set the active canvas's close date. The app reads canvases.closes_at live, so this takes
// effect immediately (countdowns, claim/submit locking, finale reveal) — no redeploy needed.
//
//   node --env-file=.env.local scripts/set-deadline.mjs 2026-06-24T06:59:59Z
//   (no arg → just prints the current value)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const SLUG = "what-home-looks-like";

const fmt = (iso) => (iso ? `${iso}  (PDT: ${new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })})` : "(unset)");

const { data: before, error: e0 } = await db.from("canvases").select("slug, closes_at").eq("slug", SLUG).maybeSingle();
if (e0) { console.error("read failed:", e0.message); process.exit(2); }
if (!before) { console.error(`no canvas with slug "${SLUG}"`); process.exit(2); }
console.log("current closes_at:", fmt(before.closes_at));

const iso = process.argv[2];
if (!iso) { console.log("\n(no new value passed — nothing changed.)"); process.exit(0); }
if (Number.isNaN(Date.parse(iso))) { console.error(`\n"${iso}" is not a valid ISO datetime`); process.exit(2); }

const { error: e1 } = await db.from("canvases").update({ closes_at: iso }).eq("slug", SLUG);
if (e1) { console.error("update failed:", e1.message); process.exit(2); }

const { data: after } = await db.from("canvases").select("closes_at").eq("slug", SLUG).maybeSingle();
console.log("new closes_at:    ", fmt(after?.closes_at));
console.log("\n✓ deadline updated.");
