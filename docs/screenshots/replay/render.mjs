// Render the replay mockups to PNGs: node docs/screenshots/replay/render.mjs (uses the preinstalled Playwright Chromium).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
const browser = await chromium.launch();
for (const [state, width, height] of [["scrub", 1440, 860], ["step", 1440, 860], ["moments", 1440, 860], ["loading", 1440, 860], ["mobile", 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`file://${here}mockup.html?state=${state}`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${here}${state}.png`, fullPage: false });
  await page.close();
}
await browser.close();
