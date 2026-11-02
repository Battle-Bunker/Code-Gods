/**
 * The goal card and grid hover views in the REAL player app, recorded as a video (docs/annotations-design.md §12).
 * Needs the local engine (`pnpm --filter @workspace/engine dev`). Seeds a First Steps room of three players whose
 * goals can only be annotated families (excludedFamilies holds every other one), starts a game, opens alice's app on
 * a Vite dev server of this checkout, shows her goal card, explores its example board and hovers a live grid.
 *
 *   node --experimental-transform-types e2e/goal-card-video.ts <out-dir>      (writes <out-dir>/real-app-goal-card.webm; the
 *   seeded credentials and screenshots stay in a temporary directory, printed at the end)
 */
import "../../engine/scripts/local-only.mjs";
import { execFileSync, spawn } from "node:child_process";
import type { Locator, Page } from "playwright";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const OUT = resolve(process.argv[2] ?? "goal-card-video");
mkdirSync(OUT, { recursive: true });
// Credentials, the raw recording and the screenshots stay in a private scratch directory: only the clip goes to OUT.
const WORK = mkdtempSync(join(tmpdir(), "goal-card-video-"));
process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";
const ENGINE = new URL("../../engine", import.meta.url).pathname;
const { FAMILIES, LENSES } = await import("@workspace/game-utilities");
const annotated = new Set(LENSES.map(l => l.familyId));
const excluded = FAMILIES.filter(f => f.objectType === "Grid" && f.role === "reward" && !annotated.has(f.familyId ?? f.id)).map(f => f.id);
const settings = { excludedFamilies: excluded, planningSeconds: 2, halfLifeSeconds: 3600, penaltyWeight: 0 };
const seed = JSON.parse(execFileSync("node", ["--experimental-transform-types", "--disable-warning=ExperimentalWarning", "scripts/seed-players.ts",
  "--players", "alice,bob,carol", "--out", join(WORK, "secrets"), "--settings", JSON.stringify(settings)], { cwd: ENGINE, encoding: "utf8" })) as {
  roomId: string; shortCode: string; players: { identity: string; session: string; envFile: string }[] };
const env = Object.fromEntries(readFileSync(seed.players[0].envFile, "utf8").trim().split("\n").map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const { browserJwt } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const alice = new ConvexHttpClient(process.env.CG_TEST_CLOUD_URL);
alice.setAuth(await browserJwt(seed.players[0].session));
await alice.action(makeFunctionReference<"action">("owner:command"), { roomId: seed.roomId, action: "start", requestId: crypto.randomUUID() });

const PORT = 22797, KEY = "goal-card-video-key";
const vite = spawn("npx", ["vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--strictPort"], {
  cwd: new URL("..", import.meta.url).pathname, stdio: "ignore", detached: true,
  env: { ...process.env, PORT: String(PORT), CODE_GODS_ENGINE_URL: env.CODE_GODS_ENGINE_URL, CODE_GODS_CREDENTIAL: env.CODE_GODS_CREDENTIAL, CODE_GODS_LAUNCH_KEY: KEY },
});
const stop = () => { try { process.kill(-vite.pid!, "SIGTERM"); } catch { /* gone */ } };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Glide the pointer to an element's centre (the dock's sashes may sit over a popover's edge, so no actionability wait). */
async function glide(page: Page, target: Locator, steps = 14) {
  const box = await target.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
}
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* not yet */ } await sleep(1000); }

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, recordVideo: { dir: WORK, size: { width: 1280, height: 860 } } });
const page = await context.newPage();
try {
  await page.goto(`http://127.0.0.1:${PORT}/__codegods/launch?key=${KEY}`);
  await page.waitForSelector("[data-testid=text-self-label]", { timeout: 60_000 });
  await page.waitForFunction(() => /running/i.test(document.querySelector("[data-testid=text-phase]")?.textContent ?? ""), null, { timeout: 120_000 });
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[data-testid=dialog-palette]");
  await page.keyboard.type("Your secret goal");
  await page.keyboard.press("Enter");
  const board = page.locator("[data-testid=goal-example-board]");
  await board.waitFor({ timeout: 30_000 });
  await board.scrollIntoViewIfNeeded();
  await sleep(1500);
  await page.screenshot({ path: join(WORK, "goal-card.png") });
  const size = Math.round(Math.sqrt(await board.locator("[data-cell]").count()));
  for (const [r, c] of [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [3, 1], [3, 3]].filter(([r, c]) => r < size && c < size)) {
    await glide(page, board.locator(`[data-cell="${r},${c}"]`));
    await sleep(1000);
  }
  const live = page.locator("[data-testid=panel-utility] [data-testid=grid-object]").first();
  if (await live.count()) {
    await live.scrollIntoViewIfNeeded();
    await glide(page, live, 20);
    const pop = page.locator("[data-testid=grid-object-goal]");
    await pop.waitFor({ timeout: 10_000 });
    await sleep(1200);
    await page.screenshot({ path: join(WORK, "grid-popover.png") });
    for (const [r, c] of [[0, 1], [1, 1], [2, 2], [3, 2]]) { await glide(page, pop.locator(`[data-cell="${r},${c}"]`)); await sleep(1000); }
  }
  console.log("goal card video: ok");
} catch (e) {
  await page.screenshot({ path: join(WORK, "failure.png") }).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  stop();
  rmSync(join(WORK, "secrets"), { recursive: true, force: true });
  console.log(`screenshots: ${WORK}`);
  if (video) {
    const raw = await video.path(), out = join(OUT, "real-app-goal-card.webm");
    try { execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-c:v", "libvpx-vp9", "-crf", "42", "-b:v", "0", "-row-mt", "1", "-an", out]); rmSync(raw); }
    catch { renameSync(raw, out); }
  }
}
