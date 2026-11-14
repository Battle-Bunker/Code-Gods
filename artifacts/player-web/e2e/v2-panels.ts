/**
 * Stored panels against the LIVE local engine (`pnpm --filter @workspace/engine dev`). At desktop (1440×900) and phone
 * (390×844):
 *   create a room → "Play a practice game" → open "Your panels" from a pane's menu → save code with a syntax error and
 *   see the compiler's diagnostics → save the example panel (panel.save, as the signed-in player) → open it as a pane →
 *   inside its sandboxed frame it shows the game's phase, roster and the player's rule through the v2 `@sdk` → summon and
 *   start the world, and the frame follows the game to "live" → save a second version, roll back, turn it off and on,
 *   delete it → the page never scrolls sideways.
 *
 *   pnpm --filter @workspace/player-web run e2e:panels        (SKIP_DEPLOY=1 reuses the uploaded build)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const shots = process.env.SHOTS_DIR ?? path.join(import.meta.dirname, "shots");
mkdirSync(shots, { recursive: true });

if (!process.env.SKIP_DEPLOY) {
  const deploy = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: ROOT, stdio: "inherit" });
  assert.equal(deploy.status, 0, "deploy-static failed");
}

async function signIn(browser: any, who: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  await page.goto(`${SITE}/`);
  await page.getByTestId("button-login").waitFor();
  const url = await page.evaluate(async () => {
    const r = await fetch("/api/auth/sign-in/oauth2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: "fake", callbackURL: "/" }) });
    return ((await r.json()) as { url: string }).url;
  });
  await page.goto(url);
  await page.getByRole("link", { name: new RegExp(`\\(${who}\\)`) }).click();
  await page.waitForURL(`${SITE}/`);
  await page.getByTestId("button-avatar").waitFor();
  return { context, page, errors };
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`) });

/** Runs an affordance button whose directory confirmation is a dialog (summary or modal). */
async function confirmed(page: Page, testId: string) {
  await page.getByTestId(testId).click();
  await page.getByTestId(`${testId}-confirm-ok`).click();
}

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const { context, page, errors } = await signIn(browser, "carol", viewport);
    try {
    // A short slug per run: a human's panels follow them across rooms, so an earlier run's panel may still be stored.
    const slug = `e2e-${label}-${Date.now().toString(36).slice(-5)}`;
    await page.getByTestId("button-create-room").first().click();
    await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
    await page.getByTestId("button-practice-game").click();
    await page.waitForURL(/\/games\//, { timeout: 30_000 });

    // "Your panels" from the first pane's menu, as a player would open it.
    const mine = page.getByTestId("pane-my-panels");
    if (!await mine.count()) {
      await page.locator("[data-testid^=button-pane-menu-]").first().click();
      await page.getByTestId("button-open-pane-my-panels").click();
    }
    await mine.getByTestId("panel-editor").waitFor({ timeout: 20_000 });
    // Panels an earlier, failed run left behind (at most 32 per player).
    for (let left = mine.locator("[data-testid^=row-panel-e2e-]"); await left.count();) {
      const old = (await left.first().getAttribute("data-testid"))!.slice("row-panel-".length);
      await confirmed(page, `button-panel-remove-${old}`);
      await mine.getByTestId(`row-panel-${old}`).waitFor({ state: "detached", timeout: 20_000 });
    }
    await mine.getByTestId("input-panel-slug").fill(slug);
    const source = mine.getByTestId("input-panel-source");
    const example = await source.inputValue();
    assert.match(example, /from "@sdk"/, "the editor starts with the example panel");

    // A syntax error: nothing is stored and the compiler's words are shown.
    await source.fill(example.replace("return (", "return ((("));
    await confirmed(page, "button-panel-save");
    await mine.getByTestId("text-panel-saved").getByText(/Not saved: \d+ problems? to fix/).waitFor({ timeout: 30_000 });
    const diagnostic = await mine.getByTestId("row-panel-diagnostic").first().innerText();
    assert.match(diagnostic, /^Line \d+, column \d+: .+\(TS\d+\)$/, diagnostic);
    assert.equal(await mine.getByTestId(`row-panel-${slug}`).count(), 0, "a refused save stores nothing");

    // The example as it is: saved as version 1, listed.
    await source.fill(example);
    await confirmed(page, "button-panel-save");
    await mine.getByTestId("text-panel-saved").getByText(`Saved ${slug} as version 1.`).waitFor({ timeout: 30_000 });
    await mine.getByTestId(`text-panel-version-${slug}`).getByText(/Version 1, written by you/).waitFor({ timeout: 20_000 });

    // Open it as a pane: the frame renders the game through the bridge.
    await mine.getByTestId(`button-panel-open-${slug}`).click();
    const pane = page.getByTestId(`pane-panel:${slug}`);
    await pane.waitFor({ timeout: 20_000 });
    await pane.locator("h2").getByText("My stats").waitFor({ timeout: 20_000 });
    await pane.locator(`[data-testid=panel-frame-${slug}][data-frame-state=ready]`).waitFor({ timeout: 30_000 });
    const frame = pane.frameLocator("iframe");
    await frame.getByTestId("example-phase").getByText("The game is planning.").waitFor({ timeout: 30_000 });
    assert.match(await frame.getByTestId("example-players").innerText(), /^\d+ players\.$/);
    const goal = await frame.getByTestId("example-rule").innerText({ timeout: 30_000 });
    assert.match(goal, /^Your goal: \S/, goal);
    await pane.scrollIntoViewIfNeeded();
    await shot(page, `panels-${label}-planning`);

    // Live: summon, start the world, and the panel follows the game without a reload.
    await page.getByTestId("button-summon-first").click();
    await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
    const startNow = page.getByTestId("button-start-world");
    if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
    await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });
    await frame.getByTestId("example-phase").getByText("The game is live.").waitFor({ timeout: 30_000 });
    await pane.scrollIntoViewIfNeeded();
    await shot(page, `panels-${label}-live`);

    // A second version swaps in the running frame; rolling back makes version 3 with version 1's code.
    await mine.scrollIntoViewIfNeeded();
    await mine.getByTestId(`button-panel-edit-${slug}`).click();
    await source.waitFor();
    await page.waitForFunction((s: string) => (document.querySelector("[data-testid=input-panel-source]") as HTMLTextAreaElement | null)?.value.includes("definePanel"), slug);
    await source.fill((await source.inputValue()).replace("The game is {game.phase}.", "Phase now: {game.phase}."));
    await confirmed(page, "button-panel-save");
    await mine.getByTestId("text-panel-saved").getByText(`Saved ${slug} as version 2.`).waitFor({ timeout: 30_000 });
    await frame.getByTestId("example-phase").getByText(/^Phase now: (live|ended)\.$/).waitFor({ timeout: 30_000 });
    const rollback = mine.getByTestId(`button-panel-rollback-${slug}`);
    await rollback.click();
    await rollback.click();   // inline confirmation: "Press again to …"
    await mine.getByTestId(`text-panel-version-${slug}`).getByText(/Version 3, written by you/).waitFor({ timeout: 20_000 });
    await frame.getByTestId("example-phase").getByText(/^The game is (live|ended)\.$/).waitFor({ timeout: 30_000 });

    // Off and on: the pane says it is off, then runs again.
    await mine.getByTestId(`button-panel-toggle-${slug}`).click();
    await pane.getByTestId("stored-panel-off").waitFor({ timeout: 20_000 });
    await mine.getByTestId(`button-panel-toggle-${slug}`).click();
    await pane.locator("iframe").waitFor({ timeout: 20_000 });
    await pane.frameLocator("iframe").getByTestId("example-phase").waitFor({ timeout: 30_000 });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${label}: the page does not scroll sideways (${overflow}px)`);

    // Delete (a modal confirmation): the list loses it and its pane says so.
    await confirmed(page, `button-panel-remove-${slug}`);
    await mine.getByTestId(`row-panel-${slug}`).waitFor({ state: "detached", timeout: 20_000 });
    await pane.getByTestId("stored-panel-missing").waitFor({ timeout: 20_000 });
    assert.deepEqual(errors, [], `${label}: no page errors`);
    console.log(`${label}: saved with diagnostics, opened, live phase seen in the frame, versions, off/on and delete`);
    } catch (e) {
      // What the player saw when it failed.
      await shot(page, `panels-${label}-failure`).catch(() => {});
      console.error(`${label} failed; "Your panels" read:\n${await page.getByTestId("pane-my-panels").innerText().catch(() => "(not on screen)")}\npage errors: ${errors.join(" | ")}`);
      throw e;
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("ok - a stored panel saves (with diagnostics), opens as a pane, renders live game data through the bridge, and is managed, at desktop and phone");
