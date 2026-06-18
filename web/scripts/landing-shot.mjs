import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:3100";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const errs = []; page.on("pageerror", (e) => errs.push(String(e.message).split("\n")[0]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + "/"); if (r.ok) break; } catch {} await sleep(1000); }
await page.goto(BASE + "/", { waitUntil: "networkidle0" }); await sleep(2800);
for (let i = 0; i <= 24; i++) { await page.mouse.move(300 + i * 40, 470 - Math.sin(i / 3) * 120); await sleep(16); }
await sleep(150); await page.screenshot({ path: "/tmp/live-landing-hero.png" }); console.log("hero");
await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.4)); await sleep(900);
for (let i = 0; i <= 18; i++) { await page.mouse.move(950 - i * 34, 280 + i * 18); await sleep(16); }
await page.screenshot({ path: "/tmp/live-landing-section.png" }); console.log("section");
console.log("errors:", errs.length ? errs : "none ✓");
await b.close();
