// hypothesis: an extension/blocker aborting RSC (?_rsc=) requests + the Explorer's
// automatic router.refresh() (broadcast + visibilitychange) → Next hard-reload loop.
// simulate by ABORTING every _rsc request, then triggering refreshes, and count reloads.
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE || "https://ekam.ink";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(label, blockRsc) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  let blocked = 0;
  page.on("request", (r) => {
    if (blockRsc && (r.url().includes("_rsc=") || (r.headers()["rsc"] === "1" && r.url().includes("/canvas")))) { blocked++; r.abort(); return; }
    r.continue();
  });
  let navs = 0;
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs++; });

  console.log(`\n=== ${label} ===`);
  await page.goto(BASE + "/canvas", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => console.log("goto:", String(e.message).split("\n")[0]));
  await sleep(2500);
  const navsAfterLoad = navs;
  // trigger the automatic refreshes the Explorer wires up: visibilitychange + a wall broadcast-ish refresh
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    }).catch(() => {});
    await sleep(1500);
  }
  await sleep(2000);
  console.log(`_rsc requests blocked: ${blocked}`);
  console.log(`main-frame navigations total: ${navs}  (after initial load: ${navs - navsAfterLoad} more from refreshes)`);
  console.log(navs - navsAfterLoad >= 3 ? "  ⚠️ RELOAD LOOP REPRODUCED" : "  ✓ no reload loop");
  await ctx.close();
}

await run("control · RSC allowed", false);
await run("blocked · RSC aborted (simulated extension)", true);
await browser.close();
console.log("\ndone");
