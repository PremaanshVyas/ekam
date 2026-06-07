// Quick production-state check. Run: node --env-file=.env.local scripts/check-db.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: c, error } = await db.from("canvases").select("id,slug,grid_cols,grid_rows");
if (error) { console.error("canvases read error:", error.message); process.exit(1); }
const n = async (q) => (await q).count ?? 0;
const total = await n(db.from("tiles").select("id", { count: "exact", head: true }));
const pub = await n(db.from("tiles").select("id", { count: "exact", head: true }).eq("status", "published"));
const claimed = await n(db.from("tiles").select("id", { count: "exact", head: true }).eq("status", "claimed"));
const pending = await n(db.from("tiles").select("id", { count: "exact", head: true }).eq("status", "pending"));
console.log("canvases:", JSON.stringify(c));
console.log(`tiles → total ${total} | published ${pub} | claimed ${claimed} | pending ${pending}`);
console.log(total === 576 && pub === 10 ? "✓ PRODUCTION INTACT (576 tiles, 10 founders)" : "⚠ counts differ from expected (576/10) — review");
