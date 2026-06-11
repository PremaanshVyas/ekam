import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { publishTile, aiRejectTile } from "@/lib/publish";

/* AI moderation: Claude screens every submission (painting + display name + story)
 * right after submit, via next/server `after` so it never delays the response.
 *
 * Verdicts: approve | review | reject — stored on the tile (migration 0005), acted on
 * automatically, and logged to moderation_log (visible in the admin Log tab):
 *   approve → published immediately
 *   reject  → returned to the artist (tile + painting kept) / pending edit dropped
 *   review  → waits in the admin queue for a human
 * Set AI_AUTO=0 to demote the AI to label-only (verdicts shown, no actions).
 * Fails soft at every step: no API key, missing columns, or a model error never
 * affects the artist's submit — things just wait for a human as before. */

const MOD_SYSTEM = `You are the moderation reviewer for ekam.ink, a public collaborative art wall. Strangers each paint one small tile answering the soft prompt "what home looks like", and approved tiles appear on a family friendly public canvas with the artist's display name and an optional one line story.

You will be shown the submitted painting plus the artist's display name and story text. Judge ALL three.

The wall has a global audience with many viewers from India and South Asia. Offensive content can appear in ANY language and ANY script: English, Hindi, Urdu, Punjabi, Bengali, Tamil, Arabic and others, including slang TRANSLITERATED into Latin letters. Treat Romanized Hindi/Urdu profanity exactly like English profanity (examples: "lund", "chutiya", "bhosdike", "madarchod", "bhenchod", "gandu", "randi", "lauda"). Profanity smuggled inside an innocent looking display name (e.g. a real first name followed by a slang word) is still profanity.

Work in this order:
1. Transcribe EVERY piece of text you can find into "text_found": words painted in the image (any script, any orientation, stylized or partial), plus the display name and story. Write "none" if there is truly no text.
2. Clear each transcribed word individually, considering every language you know and common transliterations.
3. Then judge the imagery.

This is amateur art made in a tiny browser paint tool. Scribbles, abstract shapes, rough doodles, blank-ish or low effort tiles, weird or surreal art are all completely fine. Never judge artistic quality.

"approve" ONLY when you can positively clear every word and every symbol. If "text_found" contains any word you do not confidently recognize as innocent, in any language or transliteration, you MUST NOT approve: choose "review".

"reject" for clear violations:
- sexual or explicit content, in image or text, in any language
- hate symbols, slurs, or extremist imagery
- graphic violence or gore
- harassment or targeting of a person
- personal information (phone numbers, addresses, emails)
- spam: advertising, URLs, QR codes, promo text

"review" whenever you are not certain, including:
- any word you cannot confidently verify as innocent (unknown languages, possible transliteration, slang you half recognize)
- text in a script you cannot fully read (Devanagari, Urdu/Arabic, Tamil, etc.)
- possible hidden, stylized or partially visible text
- political slogans, party symbols, flags or leaders used as a message
- religious symbols or figures used provocatively or ambiguously
- an ambiguous shape that might be sexual or hateful

When torn between approve and review, choose review. When torn between review and reject, choose review.

Keep "reason" to one short sentence an admin can read at a glance.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text_found", "verdict", "reason", "categories"],
  properties: {
    text_found: { type: "string" },
    verdict: { type: "string", enum: ["approve", "review", "reject"] },
    reason: { type: "string" },
    categories: { type: "array", items: { type: "string", enum: ["sexual", "hate", "violence", "harassment", "pii", "spam", "profanity", "political", "religious", "unreadable-text", "other"] } },
  },
} as const;

type Verdict = { text_found: string; verdict: "approve" | "review" | "reject"; reason: string; categories: string[] };

// Deterministic backstop for TEXT fields (name + story): unambiguous Romanized
// Hindi/Urdu profanity. A hit caps the verdict at "review" even if the model
// approved — so a known word can never slip through on a bad model day. Exact
// token matches only (word boundaries), to spare innocent lookalikes.
const FLAG_WORDS = [
  "lund", "chutiya", "chutiye", "chutia", "bhosdi", "bhosdike", "bhosdika", "bsdk",
  "madarchod", "behenchod", "bhenchod", "betichod", "gandu", "gaand", "randi",
  "lauda", "lavda", "loda", "jhant", "choot", "chut", "tatti", "haramzada", "haramzade",
];

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
    let v = JSON.parse(text) as Verdict;

    // wordlist backstop on the text fields — known profanity can never auto-approve
    const blob = ` ${(tile.artist_name || "").toLowerCase()} ${story.toLowerCase()} ${(v.text_found || "").toLowerCase()} `;
    const hit = FLAG_WORDS.find((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(blob));
    if (hit && v.verdict === "approve") {
      v = { ...v, verdict: "review", reason: `Contains "${hit}", which may be profane in Hindi/Urdu. A human should confirm.`, categories: ["profanity"] };
    }

    // store the verdict — tolerant of migration 0005 not being run yet
    await db.from("tiles").update({
      ai_verdict: v.verdict, ai_reason: v.reason.slice(0, 300), ai_checked_at: new Date().toISOString(),
    }).eq("id", tileId);

    const auto = process.env.AI_AUTO !== "0";
    if (auto && v.verdict === "approve") await publishTile(db, tileId, "ai");
    else if (auto && v.verdict === "reject") await aiRejectTile(db, tileId, v.reason);
    else {
      const seen = v.text_found && v.text_found.toLowerCase() !== "none" ? ` [text: ${v.text_found}]` : "";
      await db.from("moderation_log").insert({ tile_id: tileId, action: "ai-screened", reason: `${v.verdict}: ${v.reason}${seen}`.slice(0, 300) });
    }
  } catch (err) {
    // never let moderation problems touch the artist's submit; leave a trace for the admin
    try {
      const db = supabaseAdmin();
      await db.from("tiles").update({ ai_verdict: "error", ai_reason: String((err as Error).message || err).slice(0, 300), ai_checked_at: new Date().toISOString() }).eq("id", tileId);
    } catch { /* columns may not exist yet */ }
  }
}
