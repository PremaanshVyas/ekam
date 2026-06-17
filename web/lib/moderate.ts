import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { publishTile, aiRejectTile } from "@/lib/publish";

/* AI moderation: Claude screens every submission (painting + display name + story)
 * right after submit, via next/server `after` so it never delays the response.
 *
 * Goal: precise AND free. Real art has full freedom — abstract scribbles, zigzags,
 * doodles all approve. But NOTHING hateful, extremist, political, sexual or offensive may
 * go live, however small or hidden. TWO passes, both judging by RECOGNITION (flag what is
 * clearly identifiable, even tiny / rotated / in a corner; never invent offense from
 * genuinely abstract marks):
 *   pass 1 enumerates every element + transcribes all text, then judges;
 *   pass 2 is a fresh adversarial sweep of corners / edges / borders / small details for
 *   anything pass 1 missed. A tile must clear BOTH to auto-publish; either flag → human.
 *
 *   approve (both passes) → published immediately
 *   reject  → returned to the artist (keeps the tile + can request a human review)
 *   review  → waits in the admin queue for a human
 * Text backstops cap known written profanity / hate terms at review. AI_AUTO=0 = label-only.
 * Fails soft at every step: no API key, missing columns, or a model error never
 * affects the artist's submit — things just wait for a human as before. */

const MOD_SYSTEM = `You are the safety reviewer for ekam.ink, a public ALL-AGES collaborative art wall. Strangers each paint one small tile answering "say what's in your mind". When you APPROVE a tile it auto-publishes immediately — live to everyone, next to the artist's name and an optional one-line story — with no further check. An approval is final, so nothing hateful, extremist, political, sexual or otherwise offensive may ever pass you, no matter how small it is or where it sits.

Hold two duties at once:

FREEDOM for real art. Abstract work, scribbles, zigzags, rough or messy doodles, surreal or low-effort marks, ordinary scenes and objects, and normal or playful words are all welcome. Never judge skill, effort, or weirdness. Never invent a meaning for marks you cannot actually identify — a zigzag that does not clearly depict anything is just a zigzag; approve it.

PRECISION about real violations. People DO hide things: a small swastika in a corner, a slur in tiny letters along an edge, genitals tucked into an innocent scene, a campaign slogan in the background. You must catch these. Scan the WHOLE tile every time — center, all four corners, all four edges and borders, the background, and any small, faint, rotated or stylized detail. Size and placement never reduce severity.

Judge by RECOGNITION, never by suspicion:
- If you can clearly RECOGNIZE a specific violation (a real swastika, a legible slur, drawn genitalia, an election slogan), you MUST act on it — however small or hidden.
- If a mark is genuinely abstract and you cannot identify it AS a specific offensive thing, do NOT flag it. "It could resemble…" is not recognition. Never fail art for a vague resemblance.

Do this every time:
1. Scan the whole image (corners, edges, borders, background, small marks). List what you actually recognize in "elements_found".
2. Transcribe every piece of real, legible text into "text_found" — words in the image (any script, any orientation, stylized or partial), plus the display name and story. If it is only abstract marks with no real writing, put "none"; never invent words from scribbles.
3. Judge each recognized element and word.

REJECT (a clear, recognizable violation — the tile is returned to the artist, who can request a human review):
- a recognizable hate or extremist symbol: a Nazi swastika (tilted or rotated included), SS runes, KKK imagery, and the like
- a real slur or hate word, legible, in any language or transliteration; or text glorifying a genocidal/extremist figure or calling for harm to a group ("Hitler", "kill all <group>")
- POLITICAL or election content: a candidate or party name, a politician's likeness, a campaign or voting slogan ("vote 2026", "vote for X"), a ballot/election reference, or a national flag or party symbol used as a statement
- sexual content or recognizable genitalia (an actual depiction, not an ambiguous blob or line)
- graphic violence or gore unambiguously depicted, a real threat, personal data (phone/address/email), or advertising / URL / QR-code spam

REVIEW (do NOT publish — send to a human who decides) when you recognized SOMETHING concerning but genuinely cannot be sure:
- a swastika or other symbol you cannot confidently tell apart from a benign religious one
- a possible slur or political reference in a script or language you cannot fully read
- a mark you recognize as possibly offensive but cannot confidently confirm

APPROVE only when you can positively clear the whole tile — no recognizable offensive, political, hateful or sexual content, and no concerning text. Pure abstract or ordinary art with nothing identifiable to flag is always an approve.

When you recognized something offensive or political but are unsure of its severity, never approve — choose REVIEW or REJECT. Keep "reason" to one short sentence.`;

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

// Pass 2: a fresh, adversarial pair of eyes — the LAST check before a tile goes live.
const VERIFY_SYSTEM = `You are the SECOND safety reviewer for an all-ages public art wall, and the last check before this tile goes live. A first reviewer already cleared it. Your only job is to catch what they missed. Look like someone who hid something on purpose: inspect every corner, edge, border, the background, and any small, faint, rotated or stylized detail.

Hunt specifically for:
- hate or extremist symbols anywhere — a Nazi swastika (rotated or partial included), SS runes, KKK imagery
- political or election content — a candidate/party name or symbol, a politician's likeness, a voting/campaign slogan ("vote 2026"), a flag used as a statement
- a slur or profanity in ANY language or script, including small or stylized text and Romanized Hindi/Urdu (lund, chutiya, madarchod, gandu, randi, lauda, bhosdike…)
- sexual content or recognizable genitalia tucked anywhere
- gore, a real threat, personal data, or advertising / URL / QR spam

Judge by RECOGNITION, not suspicion. If you can actually RECOGNIZE any of the above — however small or hidden — answer clean=false with a one-line reason. If the tile is only abstract marks, scribbles, ordinary art or innocent words with nothing you can identify as the above, answer clean=true. Never fail a tile for a shape that merely resembles something. Be thorough about hidden things; generous about genuinely abstract art.`;

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

// Unambiguous hate/extremist terms (text). A hit caps an approve at "review" — a net under
// the vision passes, never the sole judge. Kept tight to avoid innocent lookalikes.
const HATE_WORDS = [
  "hitler", "heil hitler", "heilhitler", "sieg heil", "siegheil", "nazi", "nazis", "neonazi",
  "swastika", "kkk", "white power", "whitepower", "1488",
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

    // wordlist backstop on the text fields — known profanity / hate terms can never auto-approve
    const blob = ` ${(tile.artist_name || "").toLowerCase()} ${story.toLowerCase()} ${(v.text_found || "").toLowerCase()} `;
    const tok = (w: string) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(blob);
    const hate = HATE_WORDS.find(tok);
    const hit = FLAG_WORDS.find(tok);
    if (hate && v.verdict === "approve") {
      v = { ...v, verdict: "review", reason: `Mentions "${hate}" — possible hate/extremist reference, sent to a human.`, categories: ["hate"] };
    } else if (hit && v.verdict === "approve") {
      v = { ...v, verdict: "review", reason: `Contains "${hit}", which may be profane in Hindi/Urdu. A human should confirm.`, categories: ["profanity"] };
    }

    const auto = process.env.AI_AUTO !== "0";

    // second adversarial pass before anything auto-publishes: a fresh look that hunts the
    // corners, edges and small details for what pass 1 might have cleared. Both must agree.
    if (auto && v.verdict === "approve") {
      const runVerify = async (): Promise<{ clean: boolean; reason: string }> => {
        const res2 = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 4000, // adaptive thinking + the verdict JSON must both fit, or it truncates
          thinking: { type: "adaptive" },
          system: VERIFY_SYSTEM,
          messages: [{ role: "user", content: userContent }],
          output_config: { format: { type: "json_schema", schema: VERIFY_SCHEMA } },
        });
        const t2 = res2.content.find((b) => b.type === "text")?.text ?? "";
        if (!t2) throw new Error(`empty verifier output (stop_reason: ${res2.stop_reason})`);
        return JSON.parse(t2) as { clean: boolean; reason: string };
      };
      // one retry covers a transient hiccup before falling back to a human
      let v2: { clean: boolean; reason: string } | null = null;
      let lastErr = "";
      for (let attempt = 0; attempt < 2 && !v2; attempt++) {
        try { v2 = await runVerify(); }
        catch (e) { lastErr = (e as Error)?.message || String(e); }
      }
      if (v2) {
        if (!v2.clean) v = { ...v, verdict: "review", reason: `Second look flagged: ${v2.reason}`, categories: v.categories.length ? v.categories : ["other"] };
      } else {
        // genuinely unavailable after a retry → fail safe to a human, never auto-publish on one opinion
        console.error("[moderate] verifier unavailable after retry:", lastErr);
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
