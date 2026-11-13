/**
 * Screenshots of annotations by scoring unit (docs/screenshots/annotations-units/): one per family in the gallery,
 * with a unit picked on the board (its region, its box and the arrow between them).
 *   node --experimental-transform-types e2e/annotations-shots.ts [outDir]
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const OUT = process.argv[2] ?? new URL("../../../docs/screenshots/annotations-units", import.meta.url).pathname;
const PORT = Number(process.env.PORT_ANNOTATIONS ?? 22796), BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("npx", ["vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, PORT: String(PORT) }, detached: true,
});
const stop = () => { try { process.kill(-server.pid!); } catch { /* gone */ } };
await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => { stop(); reject(new Error("vite did not start")); }, 60_000);
  server.stdout!.on("data", d => { if (String(d).includes(String(PORT))) { clearTimeout(t); resolve(); } });
});
const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/annotations.html`);
  const families = await page.locator("[data-family]").evaluateAll(els => els.map(e => e.getAttribute("data-family")!));
  for (const f of families) {
    const board = page.locator(`[data-testid=example-${f}]`);
    await board.scrollIntoViewIfNeeded();
    // Hover the top unit's box: the board draws its region and the arrow to the box.
    await board.locator("[data-testid=goal-unit]").first().hover();
    await board.screenshot({ path: `${OUT}/${f}.png` });
  }
  // The ★ sections: the whole pair of boards, so the shot shows the open-but-empty one beside the one that scores.
  const tiered = await page.locator("[data-tiered-family]").evaluateAll(els => els.map(e => e.getAttribute("data-tiered-family")!));
  for (const f of tiered) {
    const section = page.locator(`[data-tiered-family=${f}]`);
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: `${OUT}/star-${f}.png` });
  }
  console.log(`annotation screenshots: ${families.length} families and ${tiered.length} ★ sections in ${OUT}`);
} finally {
  await browser.close();
  stop();
}
