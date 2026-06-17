// screenshots for the claim-grace feature: the claim panel (name field + grace copy)
// and the admin "held" tab (claimed-but-unsubmitted tiles + release).
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const PASS = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^ADMIN_PASSWORD=(.*)$/m)?.[1]?.trim();
const UA_M = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + "/"); if (r.ok) break; } catch {} await sleep(1000); }

// 1) claim panel — click the wall to open it (does NOT claim; claim needs the button)
for (const [w, h, tag] of [[1280, 860, "desk"], [390, 844, "mob"]]) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulate({ viewport: { width: w, height: h, deviceScaleFactor: 2, isMobile: w < 700, hasTouch: w < 700 }, userAgent: w < 700 ? UA_M : "Mozilla/5.0" });
  await page.goto(BASE + "/canvas", { waitUntil: "networkidle0" }); await sleep(2600);
  await page.evaluate(() => document.querySelector(".ex__introx")?.click()); await sleep(300);
  const box = await (await page.$("canvas")).boundingBox();
  let opened = false;
  for (const [fx, fy] of [[0.5, 0.5], [0.42, 0.42], [0.6, 0.58], [0.34, 0.6], [0.66, 0.38], [0.5, 0.3]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await sleep(900);
    if (await page.evaluate(() => !!document.querySelector(".panel--claim") && /This tile is open/.test(document.body.innerText))) { opened = true; break; }
    await page.evaluate(() => document.querySelector(".panel__x")?.click()); await sleep(250);
  }
  await page.screenshot({ path: `/tmp/claim-${tag}.png` });
  console.log(`claim-${tag}: opened=${opened}`);
  await ctx.close();
}

// 2) admin held tab
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1000, deviceScaleFactor: 2 });
  await page.goto(BASE + "/admin/login", { waitUntil: "networkidle0" });
  await page.type('input[name="password"]', PASS || "");
  await Promise.all([page.keyboard.press("Enter"), page.waitForNavigation({ waitUntil: "networkidle0" })]);
  await page.goto(BASE + "/admin?tab=held", { waitUntil: "networkidle0" }); await sleep(1500);
  const info = await page.evaluate(() => ({ tab: /held ·/.test(document.body.innerText), heldRows: document.querySelectorAll('button[type="submit"]').length }));
  await page.screenshot({ path: "/tmp/admin-held.png", fullPage: true });
  console.log("admin-held:", JSON.stringify(info));
}
await browser.close();
console.log("done");
