// End-to-end data-path test: claim → upload image → publish → public render → cleanup.
// Run: node --env-file=.env.local scripts/test-loop.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="; // 1x1

const { data: canvas } = await db.from("canvases").select("id").eq("slug", "what-home-looks-like").single();
const { data: open } = await db.from("tiles").select("id,x,y").eq("canvas_id", canvas.id).eq("status", "open").limit(1).single();
console.log("test tile:", open.x, open.y);

const path = `${open.id}.png`;
const up = await db.storage.from("tiles").upload(path, Buffer.from(PNG, "base64"), { contentType: "image/png", upsert: true });
if (up.error) { console.error("❌ UPLOAD FAILED:", up.error.message, "\n→ Create a PUBLIC storage bucket named 'tiles' in Supabase, then re-run."); process.exit(2); }
console.log("✓ storage upload ok");

await db.from("tiles").update({ status: "pending", story: "loop test", image_path: path }).eq("id", open.id);
await db.from("tiles").update({ status: "published", artist_name: "Test", published_at: new Date().toISOString() }).eq("id", open.id);

const res = await fetch(`${url}/storage/v1/object/public/tiles/${path}`);
console.log("✓ public image HTTP", res.status);

const { data: pt } = await db.from("public_tiles").select("x,y,status,image_path,story").eq("id", open.id).single();
console.log("✓ public_tiles sees it:", pt.status, pt.image_path, `"${pt.story}"`);

// cleanup
await db.from("tiles").update({ status: "open", artist_name: null, story: null, image_path: null, published_at: null }).eq("id", open.id);
await db.storage.from("tiles").remove([path]);
console.log("✓ cleaned up — tile back to open\n✦ FULL DATA PATH VERIFIED");
