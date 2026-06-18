// reproduce the "/canvas white-flash loop": clean browser (no extensions), capture the
// REAL uncaught error, count main-frame navigations (reload loop?), watch JS heap.
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE || "https://ekam.ink";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-sandbox"],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(label, openVia) {
  const ctx = await browser.createBrowserContext(); // incognito, no extensions
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const ev = { pageerror: [], consoleErr: [], reqfail: [], nav: [], crash: 0 };
  page.on("pageerror", (e) => ev.pageerror.push(String(e.message || e).split("\n")[0]));
  page.on("error", () => ev.crash++); // page (renderer) crash
  page.on("console", (m) => { if (m.type() === "error") ev.consoleErr.push(m.text().slice(0, 200)); });
  page.on("requestfailed", (r) => ev.reqfail.push(`${r.failure()?.errorText} ${r.url().slice(0, 80)}`));
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) ev.nav.push(Date.now()); });

  console.log(`\n=== ${label} ===`);
  try {
    if (openVia === "direct") {
      await page.goto(BASE + "/canvas", { waitUntil: "domcontentloaded", timeout: 30000 });
    } else {
      await page.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 30000 });
      await sleep(1500);
      // click the "Open the canvas" CTA like the friend did
      const clicked = await page.evaluate(() => {
        const a = [...document.querySelectorAll("a")].find((x) => /open the canvas/i.test(x.textContent || ""));
        if (a) { a.click(); return true; } return false;
      });
      console.log("clicked 'Open the canvas':", clicked);
    }
  } catch (e) { console.log("goto/click threw:", String(e.message).split("\n")[0]); }

  // watch for ~14s: navigation loop + heap
  const heaps = [];
  for (let i = 0; i < 7; i++) {
    await sleep(2000);
    try { const m = await page.metrics(); heaps.push(Math.round((m.JSHeapUsedSize || 0) / 1e6)); } catch { heaps.push(-1); }
  }
  const dom = await page.evaluate(() => ({
    hasExplorer: !!document.querySelector(".explorer"),
    hasCanvas: !!document.querySelector("canvas"),
    bodyKids: document.body?.childElementCount ?? -1,
    bg: getComputedStyle(document.body).backgroundColor,
  })).catch((e) => ({ err: String(e.message).split("\n")[0] }));

  console.log("main-frame navigations:", ev.nav.length, ev.nav.length > 2 ? "  ⚠️ RELOAD LOOP" : "");
  console.log("renderer crashes:", ev.crash);
  console.log("JS heap MB over time:", heaps.join(" → "));
  console.log("DOM after settle:", JSON.stringify(dom));
  if (ev.pageerror.length) console.log("UNCAUGHT ERRORS:\n  " + [...new Set(ev.pageerror)].join("\n  "));
  if (ev.consoleErr.length) console.log("console errors:\n  " + [...new Set(ev.consoleErr)].slice(0, 8).join("\n  "));
  if (ev.reqfail.length) console.log("failed requests:\n  " + [...new Set(ev.reqfail)].slice(0, 8).join("\n  "));
  await ctx.close();
}

await run("A · landing → click Open the canvas", "click");
await run("B · direct /canvas load", "direct");
await browser.close();
console.log("\ndone");
