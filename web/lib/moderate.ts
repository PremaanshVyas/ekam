import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { publishTile, aiRejectTile } from "@/lib/publish";

/* AI moderation: Claude screens every submission (painting + display name + story)
 * right after submit, via next/server `after` so it never delays the response.
 *
 * Philosophy: this is amateur doodle art in a tiny paint tool, so the bar is "let
 * ordinary art through, stop only clearly deliberate hate / extremism / explicit
 * sexual content / spam." Ambiguous scribbles get the benefit of the doubt. A single
 * lenient pass — NOT an adversarial hunt for hidden meaning, which produced false
 * positives (e.g. reading a random zigzag as a rude gesture or a profane word).
 *
 *   approve → published immediately
 *   reject  → returned to the artist (tile + painting kept) / pending edit dropped
 *   review  → waits in the admin queue for a human (used only for genuinely borderline
 *             political / flag / provocative-religious cases, plus the wordlist backstop)
 * A deterministic wordlist still caps known WRITTEN profanity at "review", never reject.
 * Set AI_AUTO=0 to demote the AI to label-only (verdicts shown, no actions).
 * Fails soft at every step: no API key, missing columns, or a model error never
 * affects the artist's submit — things just wait for a human as before. */

const MOD_SYSTEM = `You are the safety reviewer for ekam.ink, a public collaborative art wall. Strangers each paint one small tile answering the soft prompt "say what's in your mind". Approved tiles appear on a public, all-ages canvas next to the artist's display name and an optional one-line story.

You are shown the painting plus the display name and story. Be GENEROUS. Almost everything should be approved. Your job is to let ordinary art through and stop only content that is clearly and deliberately hateful, extremist, explicitly sexual, or spam. When in doubt, APPROVE.

This is amateur art drawn in a tiny browser paint tool. Most tiles are scribbles, zigzags, abstract shapes, rough doodles, surreal or low-effort marks — all completely fine. Do NOT hunt for hidden meaning. Do NOT read random lines or squiggles as letters, words, genitals, or rude gestures. If a shape only *might* look like something when you squint, that is NOT a violation — approve it. Seeing faces or objects in abstract marks (pareidolia) is your mistake, not the artist's offense. Never judge skill, effort, neatness, or weirdness.

REJECT only when a violation is UNMISTAKABLE and clearly intentional — something any reasonable viewer would instantly recognize:
- a real slur or hate word written legibly, in English or transliterated (racial, ethnic, religious, casteist, homophobic, etc.)
- legible text glorifying an extremist or genocidal figure/ideology, or calling for harm to a group (e.g. "Hitler", "kill all <group>", "gas the <group>")
- a clearly recognizable hate/extremist symbol — a Nazi swastika, SS runes, KKK imagery (note: a Hindu/Buddhist swastika, om, cross, crescent or other plain religious symbol is NOT hate)
- explicit sexual content or clearly recognizable genitalia — an actual, recognizable drawing of it, NEVER an ambiguous blob, line or zigzag
- gore or graphic violence that is unambiguously depicted, or a direct threat against a real person or group
- real personal data (phone number, street address, email) or advertising / URL / QR-code spam

REVIEW (hand to a human, do not reject) ONLY for genuinely borderline cases a normal viewer might find pointed but that are not clear violations:
- a recognizable national flag, political party symbol, or political leader used as a statement
- a religious figure or symbol used in a clearly provocative or mocking way

APPROVE everything else — abstract or messy art, ambiguous shapes, ordinary objects and scenes, normal or playful words, mild edginess, and anything you simply are not sure about. Do not turn uncertainty into a flag.

Fill the fields honestly:
- "text_found": transcribe only text you are genuinely confident is REAL, legible writing (any script). If the tile is just shapes or scribbles with no real writing, put "none" — never invent words from abstract marks.
- "elements_found": a short list of what you actually recognize.
- "reason": one short sentence for the admin.`;

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
      // adaptive thinking spends tokens BEFORE the output — max_tokens must cover both,
      // or the JSON gets truncated and JSON.parse throws. 4000 is ample for a tile verdict
      // (you only pay for tokens actually generated, so the high ceiling is free).
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: MOD_SYSTEM,
      messages: [{ role: "user", content: userContent }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    if (!text) throw new Error(`empty screen output (stop_reason: ${res.stop_reason})`);
    let v = JSON.parse(text) as Verdict;

    // wordlist backstop on the text fields — known profanity can never auto-approve
    const blob = ` ${(tile.artist_name || "").toLowerCase()} ${story.toLowerCase()} ${(v.text_found || "").toLowerCase()} `;
    const hit = FLAG_WORDS.find((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(blob));
    if (hit && v.verdict === "approve") {
      v = { ...v, verdict: "review", reason: `Contains "${hit}", which may be profane in Hindi/Urdu. A human should confirm.`, categories: ["profanity"] };
    }

    const auto = process.env.AI_AUTO !== "0";

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
