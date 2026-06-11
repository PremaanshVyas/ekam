import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { publishTile, aiRejectTile } from "@/lib/publish";

/* AI moderation: Claude screens every submission (painting + display name + story)
 * right after submit, via next/server `after` so it never delays the response.
 *
 * Two-pass design: pass 1 enumerates everything (all text in any script, every visual
 * element, corners included) and gives a verdict. If pass 1 says "approve", a SECOND
 * adversarial pass hunts specifically for hidden/small/disguised content — both passes
 * must clear a tile before it auto-publishes. Disagreement → human review.
 *
 *   approve (×2) → published immediately
 *   reject       → returned to the artist (tile + painting kept) / pending edit dropped
 *   review       → waits in the admin queue for a human
 * Set AI_AUTO=0 to demote the AI to label-only (verdicts shown, no actions).
 * Fails soft at every step: no API key, missing columns, or a model error never
 * affects the artist's submit — things just wait for a human as before. */

const MOD_SYSTEM = `You are the moderation reviewer for ekam.ink, a public collaborative art wall. Strangers each paint one small tile answering the soft prompt "say what's in your mind", and approved tiles appear on a family friendly public canvas with the artist's display name and an optional one line story.

You will be shown the submitted painting plus the artist's display name and story text. Judge ALL three.

The wall has a global audience with many viewers from India and South Asia. Offensive content can appear in ANY language and ANY script: English, Hindi, Urdu, Punjabi, Bengali, Tamil, Arabic and others, including slang TRANSLITERATED into Latin letters. Treat Romanized Hindi/Urdu profanity exactly like English profanity (examples: "lund", "chutiya", "bhosdike", "madarchod", "bhenchod", "gandu", "randi", "lauda"). Profanity smuggled inside an innocent looking display name is still profanity.

People WILL try to sneak things past you by hiding a small offensive element inside an innocent scene: a nice house with tiny genitals drawn in a corner, a sweet landscape with a slur in small letters along the edge, a flower with a hate symbol in the stem. The most common trick is making the offensive part SMALL. Size never reduces severity: a tiny genital drawing is sexual content; a tiny slur is a slur.

Work in this order:
1. Scan the ENTIRE image methodically: center, all four corners, all four edges, background, small marks. List every distinct visual element you can identify in "elements_found" (e.g. "house, sun, two stick figures, small unidentified shape bottom left").
2. Transcribe EVERY piece of text into "text_found": words painted in the image (any script, any orientation, stylized or partial), plus the display name and story. Write "none" if there is truly no text.
3. Clear each element and each word individually. Then judge.

This is amateur art made in a tiny browser paint tool. Scribbles, abstract shapes, rough doodles, blank-ish or low effort tiles, weird or surreal art are all completely fine. Never judge artistic quality.

"approve" ONLY when you can positively clear every element, every word and every symbol. If anything in "elements_found" is an unidentified shape that could plausibly be sexual or hateful, or "text_found" contains any word you do not confidently recognize as innocent in any language or transliteration, you MUST NOT approve: choose "review".

"reject" for clear violations, no matter how small the offending element is or how innocent the rest of the tile looks:
- genitalia or sexual content anywhere in the image, even tiny, crude, cartoonish, or tucked into a corner of an otherwise innocent scene
- hate symbols, slurs, or extremist imagery
- graphic violence or gore
- harassment or targeting of a person
- personal information (phone numbers, addresses, emails)
- spam: advertising, URLs, QR codes, promo text

"review" whenever you are not certain, including:
- any small or ambiguous shape that might be sexual or hateful
- any word you cannot confidently verify as innocent (unknown languages, possible transliteration, slang you half recognize)
- text in a script you cannot fully read (Devanagari, Urdu/Arabic, Tamil, etc.)
- possible hidden, stylized or partially visible text
- political slogans, party symbols, flags or leaders used as a message
- religious symbols or figures used provocatively or ambiguously

When torn between approve and review, choose review. When torn between review and reject, choose review.

Keep "reason" to one short sentence an admin can read at a glance.`;

// Pass 2: a fresh pair of eyes whose ONLY job is to catch what pass 1 might have missed.
const VERIFY_SYSTEM = `You are the second reviewer for a family friendly public art wall. A previous reviewer already cleared this tile. Your ONLY job is to catch what they might have missed. Hunt specifically for hidden, small, or disguised problems:
- tiny genitalia or sexual shapes anywhere, including corners, edges, inside other objects
- small or stylized text: slurs or profanity in ANY language or script, including Romanized Hindi/Urdu slang (lund, chutiya, madarchod, gandu, randi, lauda, bhosdike...)
- hate or extremist symbols, even small or partial
- phone numbers, URLs, QR codes, advertising
- anything in the display name or story that is profane in any language

Inspect the image like an adversary drew it. If you find ANYTHING suspicious, answer clean=false with a one line reason. Only answer clean=true if you are confident the whole tile, name and story are innocent.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["elements_found", "text_found", "verdict", "reason", "categories"],
  properties: {
    elements_found: { type: "string" },
    text_found: { type: "string" },
    verdict: { type: "string", enum: ["approve", "review", "reject"] },
    reason: { type: "string" },
    categories: { type: "array", items: { type: "string", enum: ["sexual", "hate", "violence", "harassment", "pii", "spam", "profanity", "political", "religious", "unreadable-text", "other"] } },
  },
} as const;

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["clean", "reason"],
  properties: { clean: { type: "boolean" }, reason: { type: "string" } },
} as const;

type Verdict = { elements_found: string; text_found: string; verdict: "approve" | "review" | "reject"; reason: string; categories: string[] };

// Deterministic backstop for TEXT fields (name + story + whatever the model read):
// unambiguous Romanized Hindi/Urdu profanity. A hit caps the verdict at "review" even
// if the model approved. Exact token matches only, to spare innocent lookalikes.
const FLAG_WORDS = [
  "lund", "lundu", "chutiya", "chutiye", "chutia", "bhosdi", "bhosdike", "bhosdika", "bsdk",
  "madarchod", "behenchod", "bhenchod", "betichod", "gandu", "gaand", "randi",
  "lauda", "lavda", "loda", "jhant", "choot", "chut", "tatti", "haramzada", "haramzade",
];

export async function moderateTile(tileId: string): Promise<void> {
  const db = supabaseAdmin();
  try {
    if (!process.env.ANTHROPIC_API_KEY) return; // moderation simply off until the key is set

    const { data: tile } = await db
      .from("tiles")
      .select("id, status, artist_name, story, image_path, pending_image_path, pending_story")
      .eq("id", tileId).maybeSingle();
    if (!tile) return;

    const isEdit = !!tile.pending_image_path;
    const imgPath = isEdit ? tile.pending_image_path : tile.image_path;
    if (!imgPath || imgPath.startsWith("#")) return;
    if (!isEdit && tile.status !== "pending") return; // only screen things awaiting review

    // idempotency lock: exactly one screening per submission (verdict was reset to null
    // at submit; if it's no longer null someone else is already on it)
    const lock = await db.from("tiles").update({ ai_verdict: "checking" }).eq("id", tileId).is("ai_verdict", null).select("id");
    if (!lock.error && (lock.data?.length ?? 0) === 0) return;

    const story = (isEdit ? tile.pending_story : tile.story) || "";
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tiles/${imgPath}`;
    const userContent = [
      { type: "image" as const, source: { type: "url" as const, url } },
      { type: "text" as const, text: `Artist display name: ${JSON.stringify(tile.artist_name || "")}\nStory: ${JSON.stringify(story)}` },
    ];

    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 700,
      thinking: { type: "adaptive" },
      system: MOD_SYSTEM,
      messages: [{ role: "user", content: userContent }],
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

    const auto = process.env.AI_AUTO !== "0";

    // second adversarial pass before anything auto-publishes: both reviewers must agree
    if (auto && v.verdict === "approve") {
      try {
        const res2 = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 300,
          thinking: { type: "adaptive" },
          system: VERIFY_SYSTEM,
          messages: [{ role: "user", content: userContent }],
          output_config: { format: { type: "json_schema", schema: VERIFY_SCHEMA } },
        });
        const t2 = res2.content.find((b) => b.type === "text")?.text ?? "";
        const v2 = JSON.parse(t2) as { clean: boolean; reason: string };
        if (!v2.clean) v = { ...v, verdict: "review", reason: `Second look flagged: ${v2.reason}`, categories: v.categories.length ? v.categories : ["other"] };
      } catch {
        // verifier unavailable → don't auto-publish on a single opinion
        v = { ...v, verdict: "review", reason: `${v.reason} (second check unavailable, sent to a human)` };
      }
    }

    // supersede guard: if the artist resubmitted (new image) or another screen took over
    // while the model was thinking, this run's verdict is about a STALE image — abandon
    // it silently and let the newer run own the tile.
    const { data: cur } = await db.from("tiles").select("ai_verdict, image_path, pending_image_path").eq("id", tileId).maybeSingle();
    if (!cur) return;
    const curPath = cur.pending_image_path || cur.image_path;
    if (curPath !== imgPath) return;
    if (cur.ai_verdict !== null && cur.ai_verdict !== "checking") return;

    // store the FINAL verdict — tolerant of migration 0005 not being run yet
    await db.from("tiles").update({
      ai_verdict: v.verdict, ai_reason: v.reason.slice(0, 300), ai_checked_at: new Date().toISOString(),
    }).eq("id", tileId);

    if (auto && v.verdict === "approve") await publishTile(db, tileId, "ai");
    else if (auto && v.verdict === "reject") await aiRejectTile(db, tileId, v.reason);
    else {
      const seen = v.text_found && v.text_found.toLowerCase() !== "none" ? ` [text: ${v.text_found}]` : "";
      await db.from("moderation_log").insert({ tile_id: tileId, action: "ai-screened", reason: `${v.verdict}: ${v.reason}${seen}`.slice(0, 300) });
    }
  } catch (err) {
    // never let moderation problems touch the artist's submit; leave a trace for the admin
    try {
      await db.from("tiles").update({ ai_verdict: "error", ai_reason: String((err as Error).message || err).slice(0, 300), ai_checked_at: new Date().toISOString() }).eq("id", tileId);
    } catch { /* columns may not exist yet */ }
  }
}
