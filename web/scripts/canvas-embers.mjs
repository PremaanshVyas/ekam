import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:3100";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--force-color-profile=srgb"] });
const page = await b.newPage();
await page.setViewport({ width: 1380, height: 900, deviceScaleFactor: 2 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 30; i++) { try { const r = await fetch(BASE + "/"); if (r.ok) break; } catch {} await sleep(1000); }
await page.goto(BASE + "/canvas", { waitUntil: "domcontentloaded" }); await sleep(2800);

const state = await page.evaluate(() => {
  const all = [...document.querySelectorAll(".embers")];
  const global = all.find((e) => e.parentElement === document.body);
  const internal = all.find((e) => e.closest(".explorer"));
  return {
    count: all.length,
    globalDisplay: global ? getComputedStyle(global).display : "absent",
    internalDisplay: internal ? getComputedStyle(internal).display : "absent",
    internalZ: internal ? getComputedStyle(internal).zIndex : "n/a",
  };
});
console.log("embers:", JSON.stringify(state));

// dismiss intro, then click a tile to open the preview panel
await page.evaluate(() => { const g = [...document.querySelectorAll("button")].find((b) => /got it/i.test(b.textContent || "")); if (g) g.click(); });
await sleep(700);
await page.mouse.click(720, 380); await sleep(700);
await page.mouse.click(560, 300); await sleep(1100);
const panel = await page.evaluate(() => { const p = document.querySelector(".panelwrap"); if (!p) return { open: false }; return { open: true, panelZ: getComputedStyle(p).zIndex }; });
console.log("panel:", JSON.stringify(panel));
await page.screenshot({ path: "/tmp/canvas-preview.png" });

const ok = state.globalDisplay === "none" && state.internalDisplay !== "none" && state.internalDisplay !== "absent" && state.internalZ === "1";
console.log(ok ? "\nEMBERS LAYERING OK ✓ (global hidden, internal z:1 above wall / below panels)" : "\nMISMATCH ✗");
await b.close();
