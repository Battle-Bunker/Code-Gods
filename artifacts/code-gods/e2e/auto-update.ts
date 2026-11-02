/**
 * Browser test: an open page updates itself after a deploy, without anyone refreshing (lib/player-client/src/update.ts).
 *
 *   pnpm --filter @workspace/engine dev            (or let this script start it)
 *   pnpm --filter @workspace/code-gods run e2e:update
 *
 * Build A of the engine UI is built and deployed with deploy-static, as CI does, and a page is opened on a deep route.
 * Build B (A with one file changed) is then deployed through the same script, which stamps its id and records it in
 * `version:current`.
 * While the page holds unsaved text it must stay on A and say a new version is ready; once the text is gone it counts
 * down and reloads by itself into B, on the same URL. At the end A is deployed again (a rollback).
 * Environment: CODE_GODS_SITE_URL (default http://127.0.0.1:$CONVEX_LOCAL_SITE_PORT, else :3211), SKIP_DEPLOY=1 to reuse
 * the uploaded build A.
 */
import "../../engine/scripts/local-only.mjs";   // refuses to run with CONVEX_DEPLOY_KEY set
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(import.meta.dirname, "../../..");
const SITE = (process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`).replace(/\/+$/, "");
const dist = path.join(import.meta.dirname, "../dist/public");

async function healthy() {
  try { return (await fetch(`${SITE}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}
let engine: ChildProcess | null = null;
if (!(await healthy())) {
  console.log(`# starting the engine (site ${SITE})`);
  engine = spawn("pnpm", ["--filter", "@workspace/engine", "dev"], {
    cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CONVEX_LOCAL_SITE_PORT: new URL(SITE).port },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("engine did not become READY in 180 s")), 180_000);
    const watch = (chunk: Buffer) => { if (/\[dev\] READY/.test(String(chunk))) { clearTimeout(timer); resolve(); } };
    engine!.stdout!.on("data", watch);
    engine!.stderr!.on("data", watch);
    engine!.on("exit", code => { clearTimeout(timer); reject(new Error(`engine exited (${code})`)); });
  });
}
const stopEngine = () => { if (engine?.pid) { try { process.kill(-engine.pid, "SIGINT"); } catch { /* gone */ } } };

function deploy(extra: string[] = []) {
  const r = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static", "--only", "engine", ...extra], { cwd: root, stdio: "inherit" });
  assert.equal(r.status, 0, "deploy-static succeeds");
}
const buildOf = (dir: string) => /<meta name="code-gods-build" content="([^"]+)"/.exec(readFileSync(path.join(dir, "index.html"), "utf8"))?.[1];

async function until<T>(check: () => Promise<T | false | null | undefined>, label: string, ms = 30_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check().catch(() => undefined);
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out: ${label}`);
    await new Promise(r => setTimeout(r, 200));
  }
}

const browser = await chromium.launch();
const copyB = mkdtempSync(path.join(tmpdir(), "cg-build-b-"));
try {
  if (!process.env.SKIP_DEPLOY) deploy();
  const a = buildOf(dist);
  assert.ok(a, "build A carries its id in index.html");
  // Build B: build A with one file changed (deploy-static stamps B's own id).
  cpSync(dist, copyB, { recursive: true });
  writeFileSync(path.join(copyB, "robots.txt"), `${readFileSync(path.join(copyB, "robots.txt"), "utf8")}\n# build B\n`);

  const page = await (await browser.newContext()).newPage();
  const route = `${SITE}/rooms/NOPE42?tab=settings#here`;
  await page.goto(route);
  const meta = () => page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="code-gods-build"]')?.content);
  assert.equal(await meta(), a, "the page runs build A");
  // Marks this document: a reload makes a fresh one.
  await page.evaluate(() => {
    (window as unknown as { __buildA: boolean }).__buildA = true;
    const t = document.createElement("textarea");
    t.dataset.testid = "e2e-unsaved"; t.value = "half a thought";
    document.body.append(t);
  });

  deploy(["--skip-build", "--engine-dist", copyB]);
  const b = buildOf(copyB);
  assert.ok(b && b !== a, "build B has its own id");
  console.log(`# deployed B (${b}) over A (${a})`);
  const banner = page.locator("[data-testid=update-banner]");
  await until(async () => (await banner.isVisible()) && /saved your work/.test(await banner.innerText()), "the banner asks to save first");
  await page.waitForTimeout(3000);
  assert.equal(await page.evaluate(() => (window as unknown as { __buildA?: boolean }).__buildA), true, "no reload over unsaved text");

  await page.fill("[data-testid=e2e-unsaved]", "");
  await until(async () => /when you pause/.test(await banner.innerText()), "a focused field still holds the reload");
  await page.locator("[data-testid=e2e-unsaved]").blur();
  await until(async () => /reloading in/.test(await banner.innerText()), "the countdown shows");
  await until(async () => (await meta()) === b, "the page reloads into build B by itself", 20_000);
  assert.equal(await page.evaluate(() => (window as unknown as { __buildA?: boolean }).__buildA), undefined, "a fresh document");
  assert.equal(page.url(), route, "the route, query and hash survive");
  await page.waitForTimeout(2000);
  assert.equal(await banner.count() ? await banner.isVisible() : false, false, "build B is current: no banner");
  console.log("✓ the page updated from A to B on its own and kept its route");
} finally {
  await browser.close();
  try { deploy(["--skip-build"]); } catch (e) { console.error("could not redeploy build A", e); }   // leave A live
  rmSync(copyB, { recursive: true, force: true });
  stopEngine();
}
