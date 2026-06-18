// Music player regression test.
//
// Architecture: TWO <audio> elements. data-role="out" is the audible player and plays
// NATIVELY (never captured by Web Audio) — so a wedged AudioContext can't silence it.
// data-role="viz" is a silent twin captured by createMediaElementSource only to feed the
// real, music-synced equalizer.
//
// Guards:
//  A) createMediaElementSource only ever captures the "viz" twin, NEVER the audible "out"
//     element. (That coupling is what caused the silent-after-idle bug.)
//  B) The audible element keeps playing through a simulated long hide→return.
//  C) The analyser receives live, non-zero data → the REAL synced bars (not the faux fallback).
// Uses a REAL CDP click with NO autoplay bypass, so the gesture/context path is exercised.
//
//   BASE=http://localhost:3100 node scripts/music-smoke.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:3100";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--mute-audio"] });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

await page.evaluateOnNewDocument(() => {
  // (A) record the data-role of every element captured for Web Audio output
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && AC.prototype.createMediaElementSource) {
    window.__mesRoles = [];
    const orig = AC.prototype.createMediaElementSource;
    AC.prototype.createMediaElementSource = function (el) { try { window.__mesRoles.push(el && el.dataset ? (el.dataset.role || "?") : "?"); } catch {} return orig.call(this, el); };
  }
  // (C) record the peak value the visualizer's analyser ever sees → proves real synced data
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
const outState = () => page.evaluate(() => { const a = document.querySelector('audio[data-role="out"]'); return { paused: a?.paused, t: a ? +a.currentTime.toFixed(2) : null }; });

for (let i = 0; i < 30; i++) { try { const r = await fetch(BASE + "/"); if (r.ok) break; } catch {} await sleep(1000); }
await page.goto(BASE + "/", { waitUntil: "networkidle0" }); await sleep(1500);

// REAL click on play (trusted gesture — required for the AudioContext to run)
await page.waitForSelector('button[aria-label="Play"]', { timeout: 8000 });
await page.click('button[aria-label="Play"]');
await sleep(4000);
const after = await page.evaluate(() => { const a = document.querySelector('audio[data-role="out"]'); return { paused: a?.paused, t: a ? +a.currentTime.toFixed(2) : null, vizMax: window.__vizMax ?? -1, roles: window.__mesRoles ?? [] }; });
ok("audible element plays (paused=false, currentTime advanced)", after.paused === false && after.t > 0);
ok(`real synced visualizer has live data (peak=${after.vizMax})`, after.vizMax > 0);
ok(`createMediaElementSource captured only the viz twin (roles=${JSON.stringify(after.roles)})`, after.roles.length > 0 && after.roles.every((r) => r === "viz"));

// simulate a LONG hide → return while "playing". The audible (native) element just keeps going.
await page.evaluate(() => { document.querySelector('audio[data-role="out"]').dataset.smoke = "same"; Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
await sleep(2000);
const tHidden = (await outState()).t;
await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
await sleep(3000);
const afterReturn = await page.evaluate(() => { const a = document.querySelector('audio[data-role="out"]'); return { paused: a?.paused, t: +a.currentTime.toFixed(2), sameEl: a?.dataset.smoke === "same" }; });
ok("audible element NOT remounted on return (stable)", afterReturn.sameEl);
ok("audio still playing + advanced after hide→return", afterReturn.paused === false && afterReturn.t > tHidden);
ok("audible element STILL never captured by Web Audio", await page.evaluate(() => (window.__mesRoles ?? []).every((r) => r === "viz")));

// next track still plays
await page.click('button[aria-label="Next track"]');
await sleep(2500);
ok("next track plays", (await outState()).paused === false);

// persists across a client navigation to /canvas (player is mounted in the root layout)
await page.evaluate(() => { document.querySelector('audio[data-role="out"]').dataset.nav = "before"; });
await page.evaluate(() => { const l = [...document.querySelectorAll("a")].find((x) => /open the canvas|claim/i.test(x.textContent || "")); if (l) l.click(); });
await sleep(2500);
const navd = await page.evaluate(() => { const a = document.querySelector('audio[data-role="out"]'); return { onCanvas: location.pathname.includes("/canvas"), paused: a?.paused, sameEl: a?.dataset.nav === "before" }; });
ok("music keeps playing across landing→canvas (same element)", navd.onCanvas && navd.paused === false && navd.sameEl);

console.log("\nerrors:", errs.length ? errs : "none ✓");
await b.close();
console.log(fails.length ? `\n${fails.length} FAILURES` : "\nALL PASS ✦");
process.exit(fails.length ? 1 : 0);
