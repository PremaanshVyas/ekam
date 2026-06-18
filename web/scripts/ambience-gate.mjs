import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:3100";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const page = await b.newPage();
await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 30; i++) { try { const r = await fetch(BASE + "/"); if (r.ok) break; } catch {} await sleep(1000); }
// expected: [path, embers?, trail?]
const cases = [["/", true, true], ["/canvas", true, true], ["/admin/login", false, false], ["/me", true, true]];
let ok = true;
for (const [path, we, wt] of cases) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" }); await sleep(1300);
  const has = await page.evaluate(() => ({ e: !!document.querySelector(".embers"), t: !!document.querySelector(".paint-cursor"), shine: !!document.querySelector(".btn") }));
  const pass = has.e === we && has.t === wt;
  if (!pass) ok = false;
  console.log(`${pass ? "✓" : "✗"} ${path.padEnd(14)} embers=${has.e}(want ${we})  trail=${has.t}(want ${wt})  hasBtn=${has.shine}`);
}
console.log(ok ? "\nGATES OK ✓" : "\nGATE MISMATCH ✗");
await b.close();
