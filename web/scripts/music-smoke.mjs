// smoke test: the normal play path still works after the rebuild-logic changes.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:3100";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox", "--mute-audio"] });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const errs = []; page.on("pageerror", (e) => errs.push(String(e.message).split("\n")[0]));
page.on("console", (m) => { if (m.type() === "error" && !/insights/.test(m.text())) errs.push(m.text().slice(0, 140)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 30; i++) { try { const r = await fetch(BASE + "/"); if (r.ok) break; } catch {} await sleep(1000); }
await page.goto(BASE + "/", { waitUntil: "networkidle0" }); await sleep(2000);

const clicked = await page.evaluate(() => { const p = [...document.querySelectorAll("button")].find((b) => /^play$/i.test(b.getAttribute("aria-label") || "")); if (p) { p.click(); return true; } return false; });
await sleep(3000);
const after = await page.evaluate(() => { const a = document.querySelector("audio"); return { paused: a ? a.paused : null, currentTime: a ? +a.currentTime.toFixed(2) : null, hasSrc: !!(a && a.src) }; });

// mark the current element, then simulate a LONG (>20s) hide → return while "playing".
// expectation: the player rebuilds (a fresh <audio> element, so the mark is gone) and, with
// autoplay allowed here, keeps playing — never the silent "playing" state.
await page.evaluate(() => { document.querySelector("audio").dataset.smoke = "old"; Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
await sleep(21000);
await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
await sleep(3000);
const afterReturn = await page.evaluate(() => { const a = document.querySelector("audio"); return { paused: a ? a.paused : null, currentTime: a ? +a.currentTime.toFixed(2) : null, rebuilt: a ? a.dataset.smoke !== "old" : null }; });

console.log("clicked play:", clicked);
console.log("after play:", JSON.stringify(after), after.paused === false && after.currentTime > 0 ? "▶ PLAYING ✓" : "✗");
console.log("after hide→return:", JSON.stringify(afterReturn));
console.log("errors:", errs.length ? errs : "none ✓");
await b.close();
