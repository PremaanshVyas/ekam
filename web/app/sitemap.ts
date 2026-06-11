import type { MetadataRoute } from "next";
import { supabaseAnon, CANVAS_SLUG } from "@/lib/supabase";

// The sitemap grows with the wall: every published tile's share page joins it.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://ekam.ink";
  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/canvas`, changeFrequency: "hourly", priority: 0.9 },
  ];
  try {
    const db = supabaseAnon();
    const { data: canvas } = await db.from("canvases").select("id").eq("slug", CANVAS_SLUG).maybeSingle();
    if (canvas) {
      const { data } = await db.from("public_tiles")
        .select("id, status, published_at").eq("canvas_id", canvas.id).eq("status", "published");
      for (const t of data ?? []) {
        entries.push({ url: `${base}/t/${t.id}`, lastModified: t.published_at ?? undefined, priority: 0.5 });
      }
    }
  } catch { /* a transient DB hiccup keeps the sitemap minimal, never broken */ }
  return entries;
}
