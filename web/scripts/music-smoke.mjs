// Music player regression test for the "silent after long idle" bug.
//
// ROOT CAUSE (fixed): audio output used to run through Web Audio
// (createMediaElementSource → … → destination). After a long idle the AudioContext
// wedges (clock runs, so the equalizer still animates) while its output sink dies →
// "playing" + moving bars + NO SOUND, and a captured element can never play natively again.
//
// THE INVARIANT THIS GUARDS: audio output must NEVER depend on Web Audio.
//   1. createMediaElementSource() must NEVER be called (that's what couples output to the graph).
//   2. After a simulated long hide→return, native playback keeps going untouched (no rebuild).
//   3. The normal play / next / volume path works.
// Audibility itself can't be asserted headless, but invariant #1 makes the bug class impossible.
//
//   BASE=http://localhost:3100 node scripts/music-smoke.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:3100";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox", "--mute-audio"] });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

// Trip a flag if anything ever routes the element through Web Audio for output.
await page.evaluateOnNewDocument(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && AC.prototype.createMediaElementSource) {
    const orig = AC.prototype.createMediaElementSource;
    AC.prototype.createMediaElementSource = function (...a) { window.__usedMES = true; return orig.apply(this, a); };
  }
});

const errs = []; page.on("pageerror", (e) => errs.push(String(e.message).split("\n")[0]));
page.on("console", (m) => { if (m.type() === "error" && !/insights/.test(m.text())) errs.push(m.text().slice(0, 140)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (name, cond) => { console.log((cond ? "✓ PASS" : "✗ FAIL") + "  " + name); if (!cond) fails.push(name); };

for (let i = 0; i < 30; i++) { try { const r = await fetch(BASE + "/"); if (r.ok) break; } catch {} await sleep(1000); }
await page.goto(BASE + "/", { waitUntil: "networkidle0" }); await sleep(1500);

// click play
const clicked = await page.evaluate(() => { const p = [...document.querySelectorAll("button")].find((b) => /^play$/i.test(b.getAttribute("aria-label") || "")); if (p) { p.click(); return true; } return false; });
ok("play button present + clicked", clicked);
await sleep(3000);
const after = await page.evaluate(() => { const a = document.querySelector("audio"); return { paused: a?.paused, t: a ? +a.currentTime.toFixed(2) : null }; });
ok("audio is playing (paused=false, currentTime advanced)", after.paused === false && after.t > 0);

// THE invariant: output never goes through Web Audio
ok("createMediaElementSource NEVER called (output is native)", !(await page.evaluate(() => window.__usedMES === true)));

// simulate a LONG (>20 min worth) hide → return while "playing". Native audio must
// just keep going — no rebuild, no remount, no silent-playing state.
await page.evaluate(() => { document.querySelector("audio").dataset.smoke = "same"; Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
await sleep(2000);
const tHidden = await page.evaluate(() => +document.querySelector("audio").currentTime.toFixed(2));
await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
await sleep(3000);
const afterReturn = await page.evaluate(() => { const a = document.querySelector("audio"); return { paused: a?.paused, t: +a.currentTime.toFixed(2), sameEl: a?.dataset.smoke === "same" }; });
ok("element NOT remounted on return (stable across idle/navigation)", afterReturn.sameEl);
ok("audio still playing + advanced after hide→return", afterReturn.paused === false && afterReturn.t > tHidden);
ok("still no createMediaElementSource after the idle cycle", !(await page.evaluate(() => window.__usedMES === true)));

// next track + volume still work
await page.evaluate(() => { const n = [...document.querySelectorAll("button")].find((b) => /next track/i.test(b.getAttribute("aria-label") || "")); n?.click(); });
await sleep(2500);
const nx = await page.evaluate(() => { const a = document.querySelector("audio"); return { paused: a?.paused, t: +a.currentTime.toFixed(2) }; });
ok("next track plays", nx.paused === false);

// persists across a client navigation to /canvas (player is mounted in the root layout)
await page.evaluate(() => { const a = document.querySelector("audio"); a.dataset.nav = "before"; });
await page.evaluate(() => { const l = [...document.querySelectorAll("a")].find((x) => /open the canvas|claim/i.test(x.textContent || "")); if (l) l.click(); });
await sleep(2500);
const navd = await page.evaluate(() => { const a = document.querySelector("audio"); return { onCanvas: location.pathname.includes("/canvas"), paused: a?.paused, sameEl: a?.dataset.nav === "before" }; });
ok("music keeps playing across landing→canvas (same element)", navd.onCanvas && navd.paused === false && navd.sameEl);

console.log("\nerrors:", errs.length ? errs : "none ✓");
await b.close();
console.log(fails.length ? `\n${fails.length} FAILURES` : "\nALL PASS ✦");
process.exit(fails.length ? 1 : 0);
