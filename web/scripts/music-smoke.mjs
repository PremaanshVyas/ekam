// Music player regression test.
//
// Guards two things at once:
//  A) The "silent after long idle" fix — audio output must NEVER go through Web Audio
//     (createMediaElementSource), so a wedged AudioContext can't silence it.
//  B) The REAL (music-synced) visualizer — the analyser must receive live, non-zero data.
//     This only works if the analysis AudioContext is created+resumed INSIDE the play gesture,
//     so the test uses a REAL CDP click and does NOT bypass the autoplay policy (a bypass would
//     auto-run the context and hide the very bug we're guarding).
//
//   BASE=http://localhost:3100 node scripts/music-smoke.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:3100";
// NOTE: deliberately NO --autoplay-policy bypass (so the gesture path is exercised).
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--mute-audio"] });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

await page.evaluateOnNewDocument(() => {
  // (A) trip a flag if anything routes the element through Web Audio for OUTPUT
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && AC.prototype.createMediaElementSource) {
    const orig = AC.prototype.createMediaElementSource;
    AC.prototype.createMediaElementSource = function (...a) { window.__usedMES = true; return orig.apply(this, a); };
  }
  // (B) record the peak value the visualizer's analyser ever sees → proves real synced data
  if (window.AnalyserNode && AnalyserNode.prototype.getByteFrequencyData) {
    window.__vizMax = 0;
    const og = AnalyserNode.prototype.getByteFrequencyData;
    AnalyserNode.prototype.getByteFrequencyData = function (arr) { og.call(this, arr); for (let i = 0; i < arr.length; i++) if (arr[i] > window.__vizMax) window.__vizMax = arr[i]; };
  }
});

const errs = []; page.on("pageerror", (e) => errs.push(String(e.message).split("\n")[0]));
page.on("console", (m) => { if (m.type() === "error" && !/insights/.test(m.text())) errs.push(m.text().slice(0, 140)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (name, cond) => { console.log((cond ? "✓ PASS" : "✗ FAIL") + "  " + name); if (!cond) fails.push(name); };

for (let i = 0; i < 30; i++) { try { const r = await fetch(BASE + "/"); if (r.ok) break; } catch {} await sleep(1000); }
await page.goto(BASE + "/", { waitUntil: "networkidle0" }); await sleep(1500);

// REAL click on play (trusted gesture — required for the AudioContext to run)
await page.waitForSelector('button[aria-label="Play"]', { timeout: 8000 });
await page.click('button[aria-label="Play"]');
await sleep(4000);
const after = await page.evaluate(() => { const a = document.querySelector("audio"); return { paused: a?.paused, t: a ? +a.currentTime.toFixed(2) : null, vizMax: window.__vizMax ?? -1 }; });
ok("audio is playing (paused=false, currentTime advanced)", after.paused === false && after.t > 0);
ok(`real synced visualizer has live data (peak=${after.vizMax})`, after.vizMax > 0);
ok("createMediaElementSource NEVER called (output is native)", !(await page.evaluate(() => window.__usedMES === true)));

// simulate a LONG hide → return while "playing". Native audio just keeps going.
await page.evaluate(() => { document.querySelector("audio").dataset.smoke = "same"; Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
await sleep(2000);
const tHidden = await page.evaluate(() => +document.querySelector("audio").currentTime.toFixed(2));
await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
await sleep(3000);
const afterReturn = await page.evaluate(() => { const a = document.querySelector("audio"); return { paused: a?.paused, t: +a.currentTime.toFixed(2), sameEl: a?.dataset.smoke === "same" }; });
ok("element NOT remounted on return (stable across idle/navigation)", afterReturn.sameEl);
ok("audio still playing + advanced after hide→return", afterReturn.paused === false && afterReturn.t > tHidden);
ok("still no createMediaElementSource after the idle cycle", !(await page.evaluate(() => window.__usedMES === true)));

// next track still plays
await page.click('button[aria-label="Next track"]');
await sleep(2500);
const nx = await page.evaluate(() => { const a = document.querySelector("audio"); return { paused: a?.paused }; });
ok("next track plays", nx.paused === false);

// persists across a client navigation to /canvas (player is mounted in the root layout)
await page.evaluate(() => { document.querySelector("audio").dataset.nav = "before"; });
await page.evaluate(() => { const l = [...document.querySelectorAll("a")].find((x) => /open the canvas|claim/i.test(x.textContent || "")); if (l) l.click(); });
await sleep(2500);
const navd = await page.evaluate(() => { const a = document.querySelector("audio"); return { onCanvas: location.pathname.includes("/canvas"), paused: a?.paused, sameEl: a?.dataset.nav === "before" }; });
ok("music keeps playing across landing→canvas (same element)", navd.onCanvas && navd.paused === false && navd.sameEl);

console.log("\nerrors:", errs.length ? errs : "none ✓");
await b.close();
console.log(fails.length ? `\n${fails.length} FAILURES` : "\nALL PASS ✦");
process.exit(fails.length ? 1 : 0);
