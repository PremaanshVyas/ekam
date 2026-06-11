import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { publishTile } from "@/lib/publish";

/* AI moderation: Claude screens every submission (painting + display name + story)
 * right after submit, via next/server `after` so it never delays the response.
 *
 * Verdicts: approve | review | reject — stored on the tile (migration 0005) and shown
 * in the /admin queue. The human gate stays: nothing publishes automatically unless
 * AI_AUTO_PUBLISH=1 is set, in which case confident "approve" verdicts go live and
 * everything else still waits for a human. Fails soft at every step: no API key,
 * missing columns, or a model error never affects the artist's submit. */

const MOD_SYSTEM = `You are the moderation reviewer for ekam.ink, a public collaborative art wall. Strangers each paint one small tile answering the soft prompt "what home looks like", and approved tiles appear on a family friendly public canvas with the artist's display name and an optional one line story.

You will be shown the submitted painting plus the artist's display name and story text. Judge ALL three.

This is amateur art made in a tiny browser paint tool. Scribbles, abstract shapes, rough doodles, blank-ish or low effort tiles, weird or surreal art are all completely fine: verdict "approve". Do not judge artistic quality.

Use "reject" only for clear violations:
- sexual or explicit content
- hate symbols, slurs, or extremist imagery
- graphic violence or gore
- harassment or targeting of a person
- personal information (phone numbers, addresses, emails)
- spam: advertising, URLs, QR codes, promo text

Use "review" when you genuinely cannot tell: possible hidden text you cannot read, an ambiguous symbol, or content you are uncertain about. When in doubt between approve and review, prefer review; between review and reject, prefer review.

Keep "reason" to one short sentence an admin can read at a glance.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "reason", "categories"],
  properties: {
    verdict: { type: "string", enum: ["approve", "review", "reject"] },
    reason: { type: "string" },
    categories: { type: "array", items: { type: "string", enum: ["sexual", "hate", "violence", "harassment", "pii", "spam", "unreadable-text", "other"] } },
  },
} as const;

type Verdict = { verdict: "approve" | "review" | "reject"; reason: string; categories: string[] };

export async function moderateTile(tileId: string): Promise<void> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return; // moderation simply off until the key is set

    const db = supabaseAdmin();
    const { data: tile } = await db
      .from("tiles")
      .select("id, status, artist_name, story, image_path, pending_image_path, pending_story")
      .eq("id", tileId).maybeSingle();
    if (!tile) return;

    const isEdit = !!tile.pending_image_path;
    const imgPath = isEdit ? tile.pending_image_path : tile.image_path;
    if (!imgPath || imgPath.startsWith("#")) return;
    if (!isEdit && tile.status !== "pending") return; // only screen things awaiting review
    const story = (isEdit ? tile.pending_story : tile.story) || "";
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tiles/${imgPath}`;

    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 500,
      thinking: { type: "adaptive" },
      system: MOD_SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "url", url } },
          { type: "text", text: `Artist display name: ${JSON.stringify(tile.artist_name || "")}\nStory: ${JSON.stringify(story)}` },
        ],
      }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });

    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    const v = JSON.parse(text) as Verdict;

    // store the verdict — tolerant of migration 0005 not being run yet
    await db.from("tiles").update({
      ai_verdict: v.verdict, ai_reason: v.reason.slice(0, 300), ai_checked_at: new Date().toISOString(),
    }).eq("id", tileId);
    await db.from("moderation_log").insert({ tile_id: tileId, action: "ai-screened", reason: `${v.verdict}: ${v.reason}`.slice(0, 300) });

    if (v.verdict === "approve" && process.env.AI_AUTO_PUBLISH === "1") {
      await publishTile(db, tileId, "ai");
    }
  } catch (err) {
    // never let moderation problems touch the artist's submit; leave a trace for the admin
    try {
      const db = supabaseAdmin();
      await db.from("tiles").update({ ai_verdict: "error", ai_reason: String((err as Error).message || err).slice(0, 300), ai_checked_at: new Date().toISOString() }).eq("id", tileId);
    } catch { /* columns may not exist yet */ }
  }
}
