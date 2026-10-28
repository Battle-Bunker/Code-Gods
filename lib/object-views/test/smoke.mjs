// Playwright smoke test for the object views, against the fixture page in
// artifacts/mockup-sandbox (/preview/ObjectViews). Builds it, serves it with `vite preview`, and
// checks desktop and phone (390×844) layouts in light and dark themes.
//
//   pnpm --filter @workspace/object-views smoke        (SHOTS_DIR=/path to choose screenshot dir)
//
// Needs Playwright with Chromium available to `require("playwright")`; not a package dependency.
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const sandbox = path.resolve(import.meta.dirname, "../../../artifacts/mockup-sandbox");
const port = Number(process.env.SMOKE_PORT ?? 4319);
const shots = process.env.SHOTS_DIR ?? path.join(tmpdir(), "object-views-shots");
mkdirSync(shots, { recursive: true });
const env = { ...process.env, PORT: String(port), BASE_PATH: "/" };

if (!process.env.SKIP_BUILD) {
  const b = spawnSync("pnpm", ["run", "build"], { cwd: sandbox, env, stdio: "inherit" });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
const server = spawn("pnpm", ["exec", "vite", "preview", "--port", String(port), "--strictPort"], { cwd: sandbox, env, stdio: ["ignore", "pipe", "inherit"], detached: true });
const url = `http://127.0.0.1:${port}/preview/ObjectViews`;
for (let i = 0; ; i++) {
  try { if ((await fetch(url)).ok) break; } catch { /* starting */ }
  if (i > 100) throw new Error("preview server did not start");
  await new Promise(r => setTimeout(r, 200));
}

const results = [];
const check = async (name, fn) => { await fn(); results.push(name); console.log(`ok - ${name}`); };
const browser = await chromium.launch();
try {
  for (const theme of ["light", "dark"]) {
    // Desktop: hover opens the detail view.
    const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await desk.goto(`${url}?theme=${theme}`);
    await desk.waitForSelector('[data-testid="grid-object"]');
    await check(`${theme} desktop: Int and string render their text forms`, async () => {
      assert.equal((await desk.locator('[data-testid="row-int"] td').nth(1).innerText()).trim(), "42");
      assert.equal((await desk.locator('[data-testid="row-string"] td').nth(1).innerText()).trim(), JSON.stringify('hello "gods"'));
      assert.equal(await desk.locator('[data-testid="row-string-gridlike"] [data-testid="grid-object"]').count(), 0, "string games stay strings");
      assert.equal((await desk.locator('[data-testid="row-string-gridlike"] td').nth(1).innerText()).trim(), JSON.stringify("1R,2G/3B,4R"));
    });
    await check(`${theme} desktop: grids typed and inferred, with role=img summaries`, async () => {
      assert.equal(await desk.locator('[data-testid^="row-grid"] [data-testid="grid-object"]').count(), 6);
      assert.equal(await desk.locator('[data-testid^="untyped-grid"] [data-testid="grid-object"]').count(), 6);
      const label = await desk.locator('[data-testid="row-grid-fixed"] [role="img"]').getAttribute("aria-label");
      assert.match(label, /^Grid, 3 by 3 .*Row 1: seven, red; three, green; zero, blue\./);
    });
    await check(`${theme} desktop: 7×7 compact grid fits a table row`, async () => {
      const box = await desk.locator('[data-testid="row-grid-4"] [data-testid="grid-object"]').boundingBox();
      assert.ok(box.width <= 100 && box.height <= 100, JSON.stringify(box));
    });
    await desk.screenshot({ path: path.join(shots, `desktop-${theme}.png`), fullPage: true });
    await check(`${theme} desktop: hover opens detail with canonical string and cell names`, async () => {
      await desk.locator('[data-testid="row-grid-4"] [data-testid="grid-object"]').hover();
      const detail = desk.locator('[data-testid="grid-object-detail"]');
      await detail.waitFor({ state: "visible", timeout: 3000 });
      const canonical = await desk.locator('[data-testid="grid-object-canonical"]').innerText();
      assert.equal(canonical.split("/").length, 7);
      assert.match(await detail.innerText(), / of (spades|hearts|diamonds|clubs), (red|orange|yellow|green|blue|violet)/);
      await desk.screenshot({ path: path.join(shots, `desktop-${theme}-hover-7x7.png`) });
      await desk.mouse.move(5, 5);
      await detail.waitFor({ state: "hidden", timeout: 3000 });
    });
    await check(`${theme} desktop: transformation feed outlines changed cells`, async () => {
      const after = desk.locator('[data-testid="feed-grid"] [data-testid="grid-object"]').nth(1);
      assert.equal(await after.locator("[data-changed]").count(), 2);
      assert.match(await after.locator('[role="img"]').getAttribute("aria-label"), /2 cells changed\.$/);
      await after.click();
      await desk.locator('[data-testid="grid-object-detail"]').waitFor({ state: "visible" });
      await desk.screenshot({ path: path.join(shots, `desktop-${theme}-feed-diff.png`) });
      await desk.keyboard.press("Escape");
    });
    await desk.close();

    // Phone: tap opens the detail view; no horizontal page scroll.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await phone.goto(`${url}?theme=${theme}`);
    await phone.waitForSelector('[data-testid="grid-object"]');
    await check(`${theme} phone: no horizontal page scroll`, async () => {
      const { sw, iw } = await phone.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      assert.ok(sw <= iw, `scrollWidth ${sw} > innerWidth ${iw}`);
    });
    await phone.screenshot({ path: path.join(shots, `phone-${theme}.png`), fullPage: true });
    await check(`${theme} phone: tap opens detail inside the viewport`, async () => {
      await phone.locator('[data-testid="row-grid-3"] [data-testid="grid-object"]').tap();
      const detail = phone.locator('[data-testid="grid-object-detail"]');
      await detail.waitFor({ state: "visible", timeout: 3000 });
      const box = await detail.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
      const sw = await phone.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(sw <= 390, `scrollWidth ${sw} with detail open`);
      await phone.screenshot({ path: path.join(shots, `phone-${theme}-detail-6x6.png`) });
    });
    await phone.close();
  }

  await check("colour cue toggle switches compact cells to letters and is remembered", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url);
    const grid = page.locator('[data-testid="row-grid-fixed"] [data-testid="grid-object"]');
    await grid.click();
    await page.locator('[data-testid="button-colour-cue-letter"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("code-gods.object-views.colour-cue")), "letter");
    await page.keyboard.press("Escape");
    assert.match(await grid.innerText(), /7\s*R/);
    await page.screenshot({ path: path.join(shots, "desktop-light-letter-cue.png"), fullPage: true });
    await page.reload();
    await grid.click();
    assert.equal(await page.locator('[data-testid="button-colour-cue-letter"]').getAttribute("aria-pressed"), "true");
    await page.locator('[data-testid="button-colour-cue-pattern"]').click();
    await page.close();
  });
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch { server.kill(); }
}
console.log(`\n${results.length} checks passed; screenshots in ${shots}`);
