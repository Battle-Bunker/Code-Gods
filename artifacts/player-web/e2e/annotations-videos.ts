/**
 * Short demo videos of the goal annotations (docs/annotations-design.md §12): one per annotated family (its goal-card
 * example explored cell by cell, then a live grid's hover view) and one per alternative mode, recorded from the
 * gallery page on a Vite dev server this script starts. Writes <out>/<name>.webm.
 *
 *   node --experimental-transform-types e2e/annotations-videos.ts ../../docs/videos/annotations [name…]
 *
 * Playwright records VP8 at a high bitrate; when ffmpeg is on the PATH each clip is re-encoded as VP9 (CRF 42), about a
 * fifth of the size, so the clips stay small in the repository.
 */
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Locator, Page } from "playwright";

const OUT = resolve(process.argv[2] ?? "videos"), ONLY = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });
const PORT = 22796, BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("npx", ["vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(PORT) }, detached: true,
});
const stop = () => { try { process.kill(-server.pid!, "SIGTERM"); } catch { /* gone */ } };
await new Promise<void>((ok, fail) => {
  const t = setTimeout(() => { stop(); fail(new Error("vite did not start")); }, 60_000);
  server.stdout.on("data", (d: Buffer) => { if (String(d).includes("ready")) { clearTimeout(t); ok(); } });
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Glide the mouse to an element's centre, so the video shows the pointer travelling. */
async function glide(page: Page, target: Locator, steps = 14) {
  await target.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
  const box = await target.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
}

const PATH = [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 0], [3, 1], [3, 3]];
const FAMILIES = ["parity_painter", "set_spotter", "number_bonds", "chessmaster", "honest_minesweeper", "magic_accountant", "kingdom", "picture_frame", "mirrormancer"];

const scenes: Record<string, (page: Page) => Promise<void>> = {};
for (const f of FAMILIES) {
  scenes[f] = async page => {
    await page.goto(`${BASE}/annotations.html?family=${f}`);
    const board = page.locator(`[data-testid=example-${f}]`);
    await board.waitFor();
    await sleep(1800); // the default focus, as the goal card opens
    for (const [r, c] of PATH) { await glide(page, board.locator(`[data-cell="${r},${c}"]`)); await sleep(1100); }
    await glide(page, page.locator(`[data-testid=live-${f}] [data-testid=grid-object]`).first(), 20);
    const pop = page.locator("[data-testid=grid-object-goal]");
    await pop.waitFor();
    await sleep(1500); // the hover view starts on the top-left cell
    for (const [r, c] of [[0, 2], [1, 3], [2, 1], [3, 2]]) { await glide(page, pop.locator(`[data-cell="${r},${c}"]`)); await sleep(1000); }
  };
}
scenes["mode-scrubber"] = async page => {
  await page.goto(`${BASE}/annotations.html?mode=scrubber`);
  await sleep(1200);
  await glide(page, page.locator("[data-testid=button-step-play]"));
  await page.locator("[data-testid=button-step-play]").click();
  await sleep(6500);
};
scenes["mode-whatif"] = async page => {
  await page.goto(`${BASE}/annotations.html?mode=whatif`);
  await sleep(1500);
  const what = page.locator("[data-mode=whatif]");
  for (const [r, c] of [[0, 0], [1, 2], [2, 3], [3, 0]]) {
    await glide(page, what.locator(`[data-cell="${r},${c}"]`));
    await what.locator(`[data-cell="${r},${c}"]`).click();
    await sleep(700);
    const options = what.locator("[data-testid=what-if-table] td");
    for (let k = 0; k < Math.min(3, await options.count()); k++) { await glide(page, options.nth(k), 8); await sleep(800); }
  }
};
scenes["mode-story"] = async page => {
  await page.goto(`${BASE}/annotations.html?mode=story`);
  await sleep(1200);
  await glide(page, page.locator("[data-testid=button-step-play]"));
  await page.locator("[data-testid=button-step-play]").click();
  await sleep(7500);
};

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const size = { width: 960, height: 800 };
try {
  for (const [name, play] of Object.entries(scenes)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const context = await browser.newContext({ viewport: size, recordVideo: { dir: join(OUT, ".tmp"), size } });
    const page = await context.newPage();
    await play(page);
    const video = page.video()!;
    await context.close();
    const raw = await video.path(), out = join(OUT, `${name}.webm`);
    try {
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-c:v", "libvpx-vp9", "-crf", "42", "-b:v", "0", "-row-mt", "1", "-an", out]);
    } catch {
      renameSync(raw, out); // no ffmpeg: keep Playwright's own recording
    }
    console.log(`recorded ${name}.webm`);
  }
} finally {
  rmSync(join(OUT, ".tmp"), { recursive: true, force: true });
  await browser.close();
  stop();
}
