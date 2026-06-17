// verify the rewritten moderator: lenient on abstract art, still catches clear hate.
// renders real canvases with puppeteer, runs them through the EXACT MOD_SYSTEM prompt
// (read from lib/moderate.ts so there's no drift), prints verdicts.
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import Anthropic from "@anthropic-ai/sdk";

const src = fs.readFileSync(new URL("../lib/moderate.ts", import.meta.url), "utf8");
const MOD_SYSTEM = src.match(/const MOD_SYSTEM = `([\s\S]*?)`;/)[1];
let apiKey = process.env.ANTHROPIC_API_KEY?.trim();
if (!apiKey && process.env.MOD_ENV_FILE && fs.existsSync(process.env.MOD_ENV_FILE)) {
  apiKey = fs.readFileSync(process.env.MOD_ENV_FILE, "utf8").match(/ANTHROPIC_API_KEY=["']?([^"'\r\n]+)/)?.[1]?.trim();
}
if (!apiKey) throw new Error("set ANTHROPIC_API_KEY (or MOD_ENV_FILE) in the environment");
const client = new Anthropic({ apiKey });

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["elements_found", "text_found", "verdict", "reason", "categories"],
  properties: {
    elements_found: { type: "string" }, text_found: { type: "string" },
    verdict: { type: "string", enum: ["approve", "review", "reject"] },
    reason: { type: "string" },
    categories: { type: "array", items: { type: "string", enum: ["sexual", "hate", "violence", "harassment", "pii", "spam", "profanity", "political", "religious", "unreadable-text", "other"] } },
  },
};

// each case draws into a 700x700 canvas; returns base64 png
const CASES = {
  "zigzag (the bug)": (c) => { c.strokeStyle = "#111"; c.lineWidth = 7; c.beginPath(); let x = 40, up = true; c.moveTo(x, 350); while (x < 660) { x += 55; c.lineTo(x, up ? 180 : 520); up = !up; } c.stroke(); },
  "messy scribble": (c) => { const cols = ["#d33", "#27a", "#2a6", "#e90"]; for (let i = 0; i < 6; i++) { c.strokeStyle = cols[i % 4]; c.lineWidth = 9; c.beginPath(); c.moveTo(Math.random() * 700, Math.random() * 700); for (let j = 0; j < 8; j++) c.lineTo(Math.random() * 700, Math.random() * 700); c.stroke(); } },
  "house + sun (normal)": (c) => { c.fillStyle = "#e7b04a"; c.beginPath(); c.arc(570, 140, 60, 0, 7); c.fill(); c.fillStyle = "#8a5a3b"; c.fillRect(220, 360, 260, 240); c.fillStyle = "#b3432f"; c.beginPath(); c.moveTo(200, 360); c.lineTo(350, 250); c.lineTo(500, 360); c.fill(); c.fillStyle = "#3a6"; c.fillRect(310, 470, 80, 130); },
  "HITLER text (control: hate)": (c) => { c.fillStyle = "#000"; c.font = "bold 120px sans-serif"; c.fillText("HITLER", 70, 400); },
  "nazi swastika (control: symbol)": (c) => { c.strokeStyle = "#000"; c.lineWidth = 26; c.translate(350, 350); c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(0, -140); c.lineTo(0, 140); c.moveTo(-140, 0); c.lineTo(140, 0); c.moveTo(0, -140); c.lineTo(90, -140); c.moveTo(0, 140); c.lineTo(-90, 140); c.moveTo(-140, 0); c.lineTo(-140, -90); c.moveTo(140, 0); c.lineTo(140, 90); c.stroke(); },
};

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const page = await browser.newPage();
await page.setContent("<canvas id=c width=700 height=700></canvas>");

async function render(fnSrc) {
  return await page.evaluate((s) => {
    const cv = document.getElementById("c"); const c = cv.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 700, 700); c.fillStyle = "#f4eee2"; c.fillRect(0, 0, 700, 700);
    (new Function("c", "(" + s + ")(c)"))(c);
    return cv.toDataURL("image/png").split(",")[1];
  }, fnSrc);
}

for (const [name, fn] of Object.entries(CASES)) {
  const data = await render(fn.toString());
  const res = await client.messages.create({
    model: "claude-opus-4-8", max_tokens: 4000, thinking: { type: "adaptive" }, system: MOD_SYSTEM,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/png", data } },
      { type: "text", text: `Artist display name: ""\nStory: ""` },
    ] }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });
  const v = JSON.parse(res.content.find((b) => b.type === "text").text);
  const tag = v.verdict.toUpperCase().padEnd(7);
  console.log(`${tag} ${name}`);
  console.log(`        text="${v.text_found}"  reason="${v.reason}"`);
}
await browser.close();
