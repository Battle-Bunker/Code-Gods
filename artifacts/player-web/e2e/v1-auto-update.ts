/**
 * The old auto-update scenario (archive/engine-v1 e2e/auto-update.ts), ported to the v2 app: an open page updates
 * itself after a deploy, without anyone refreshing (lib/v2-client/src/update.ts), and keeps its route.
 *
 *   pnpm --filter @workspace/engine dev
 *   pnpm --filter @workspace/player-web run e2e:v1-auto-update          (SKIP_DEPLOY=1 reuses the uploaded build A; ~1 min)
 *
 * Build A is deployed with deploy-static, as CI does, and a page is opened on a deep route. Build B (A with one file
 * changed) is deployed through the same script, which stamps its id and records it in `version:current`. While the page
 * holds unsaved text it must stay on A and say a new version is ready; once the text is gone it counts down and
 * reloads by itself into B, on the same URL. At the end A is deployed again (a rollback), so other suites run on A.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ROOT, SITE, chromium, check, report, watch } from "./v1-harness.ts";

const dist = path.join(import.meta.dirname, "../dist/public");
function deployStatic(extra: string[] = []) {
  const r = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static", ...extra], { cwd: ROOT, stdio: "inherit" });
  assert.equal(r.status, 0, "deploy-static succeeds");
}
const buildOf = (dir: string) => /<meta name="code-gods-build" content="([^"]+)"/.exec(readFileSync(path.join(dir, "index.html"), "utf8"))?.[1];
async function until<T>(fn: () => Promise<T | false | null | undefined>, label: string, ms = 30_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn().catch(() => undefined);
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out: ${label}`);
    await new Promise(r => setTimeout(r, 200));
  }
}

const browser = await chromium.launch();
const copyB = mkdtempSync(path.join(tmpdir(), "cg-build-b-"));
try {
  if (!process.env.SKIP_DEPLOY) deployStatic();
  const page = await (await browser.newContext()).newPage();
  watch(page);

  await check("an open page updates itself from build A to build B after a deploy, never over unsaved text, and keeps its route", async () => {
    const a = buildOf(dist);
    assert.ok(a, "build A carries its id in index.html");
    cpSync(dist, copyB, { recursive: true });
    writeFileSync(path.join(copyB, "robots.txt"), `${readFileSync(path.join(copyB, "robots.txt"), "utf8")}\n# build B\n`);
    const route = `${SITE}/rooms/NOPE42?tab=settings#here`;
    await page.goto(route);
    const meta = () => page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="code-gods-build"]')?.content);
    assert.equal(await meta(), a, "the page runs build A");
    // Marks this document (a reload makes a fresh one) and holds unsaved text.
    await page.evaluate(() => {
      (window as unknown as { __buildA: boolean }).__buildA = true;
      const t = document.createElement("textarea");
      t.dataset.testid = "e2e-unsaved"; t.value = "half a thought";
      document.body.append(t);
    });
    deployStatic(["--skip-build", "--app-dist", copyB]);
    const b = buildOf(copyB);
    assert.ok(b && b !== a, "build B has its own id");
    const banner = page.locator("[data-testid=update-banner]");
    await until(async () => (await banner.isVisible()) && /saved your work/.test(await banner.innerText()), "the banner asks to save first", 60_000);
    await page.waitForTimeout(3000);
    assert.equal(await page.evaluate(() => (window as unknown as { __buildA?: boolean }).__buildA), true, "no reload over unsaved text");
    await page.fill("[data-testid=e2e-unsaved]", "");
    await until(async () => /when you pause/.test(await banner.innerText()), "a focused field still holds the reload");
    await page.locator("[data-testid=e2e-unsaved]").blur();
    await until(async () => /reloading in/.test(await banner.innerText()), "the countdown shows");
    await until(async () => (await meta()) === b, "the page reloads into build B by itself", 30_000);
    assert.equal(await page.evaluate(() => (window as unknown as { __buildA?: boolean }).__buildA), undefined, "a fresh document");
    assert.equal(page.url(), route, "the route, query and hash survive");
    await page.waitForTimeout(2000);
    assert.equal(await banner.count() ? await banner.isVisible() : false, false, "build B is current: no banner");
  });
} finally {
  await browser.close();
  try { deployStatic(["--skip-build"]); } catch (e) { console.error("could not redeploy build A", e); }   // leave A live
  rmSync(copyB, { recursive: true, force: true });
}
report();
