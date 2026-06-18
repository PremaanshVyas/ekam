import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:3100";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--force-color-profile=srgb"] });
const page = await b.newPage();
await page.setViewport({ width: 1380, height: 900, deviceScaleFactor: 2 });
const errs = []; page.on("pageerror", (e) => errs.push(String(e.message).split("\n")[0]));
page.on("console", (m) => { if (m.type() === "error" && !/insights|favicon|404|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 120)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 30; i++) { try { const r = await fetch(BASE + "/"); if (r.ok) break; } catch {} await sleep(1000); }
const trail = async (pts) => { for (const [x, y] of pts) { await page.mouse.move(x, y); await sleep(55); } };

// LANDING — trail + hover the hero CTA (shine), full shot + button close-up
await page.goto(BASE + "/", { waitUntil: "networkidle0" }); await sleep(1800);
await trail([[280, 300], [460, 340], [640, 380], [740, 250]]);
const cta = await page.evaluate(() => { const v = [...document.querySelectorAll(".btn--primary")].find((e) => { const r = e.getBoundingClientRect(); return r.top > 40 && r.top < 760; }); if (!v) return null; const r = v.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, cx: Math.round(r.x + window.scrollX - 16), cy: Math.round(r.y + window.scrollY - 14), cw: Math.round(r.width + 32), ch: Math.round(r.height + 28) }; });
if (cta) { await page.mouse.move(cta.x - 140, cta.y); await sleep(40); await page.mouse.move(cta.x - cta.cw / 2 + 12, cta.y); await sleep(300); } // cursor at the left edge so the gloss + label read clearly
await page.screenshot({ path: "/tmp/live-all-landing.png" });
if (cta) await page.screenshot({ path: "/tmp/live-all-btn.png", clip: { x: cta.cx, y: cta.cy, width: cta.cw, height: cta.ch } });

// CLAIM
await page.goto(BASE + "/claim", { waitUntil: "networkidle0" }); await sleep(1400);
await trail([[360, 280], [560, 360], [720, 430]]); await sleep(280);
await page.screenshot({ path: "/tmp/live-all-claim.png" });

// CANVAS (wall explorer)
await page.goto(BASE + "/canvas", { waitUntil: "networkidle0" }); await sleep(2600);
await trail([[360, 280], [620, 420], [840, 520]]); await sleep(280);
await page.screenshot({ path: "/tmp/live-all-canvas.png" });

console.log("cta found:", !!cta);
console.log("errors:", errs.length ? errs : "none ✓");
await b.close();
