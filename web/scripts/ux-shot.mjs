// focused mobile screenshots for the UX-polish pass: hero scrim (#2) + first-visit intro card (#3)
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE || "http://localhost:3100";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(path, url, w, h, file, settle = 1800) {
  const page = await browser.newPage();
  await page.emulate({
    viewport: { width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await page.goto(BASE + url, { waitUntil: "networkidle0" });
  await sleep(settle);
  const info = await page.evaluate(() => {
    const intro = document.querySelector(".ex__intro");
    const bar = document.querySelector(".studio__submitbar");
    return {
      title: document.title,
      hasIntro: !!intro,
      introBottom: intro ? Math.round(intro.getBoundingClientRect().bottom) : null,
      introTop: intro ? Math.round(intro.getBoundingClientRect().top) : null,
      vh: window.innerHeight,
      vw: window.innerWidth,
      hasSubmitBar: !!bar,
      bodyOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  await page.screenshot({ path: file });
  console.log(`${path}  ${w}x${h}  ->  ${file}`);
  console.log("   " + JSON.stringify(info));
  await page.close();
}

// wait for dev server
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(BASE + "/"); if (r.ok) break; } catch {}
  await sleep(1000);
}

await shot("landing", "/", 390, 844, "/tmp/ux-landing-390.png");
await shot("landing", "/", 360, 780, "/tmp/ux-landing-360.png");
await shot("canvas", "/canvas", 390, 844, "/tmp/ux-canvas-390.png", 3000);
await shot("canvas", "/canvas", 360, 780, "/tmp/ux-canvas-360.png", 3000);

await browser.close();
console.log("done");
