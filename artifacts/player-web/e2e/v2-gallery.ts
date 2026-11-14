/**
 * The rule gallery, the room's setup picker and settings, and the what-if pane, in the browser against the LIVE local
 * engine (`pnpm --filter @workspace/engine dev`), at desktop (1440×900) and phone (390×844):
 *   /rule-gallery lists the rules of a board; a rule's page follows its numbers and tie-breaker in the URL and shows the
 *   goal card's worked example → a new room's owner picks a setup (no Lab group for a player) and changes the
 *   settings; the next game starts with them (its header says so) → during the live game, One line's "Try a change"
 *   opens What if, which shows the line after a change, your rarity with its chance and the price, and explains a bad number.
 * Every page is checked for sideways scrolling at both sizes.
 *
 *   pnpm --filter @workspace/player-web run e2e:gallery        (SKIP_DEPLOY=1 reuses the uploaded build)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { assertNoSteps } from "./no-steps.ts";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const CLOUD = `http://127.0.0.1:${process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3210"}`;
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

/** The game's header as its player reads it (a one-off read is fine in a test). */
async function header(page: Page, gameId: string) {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  return await client.query("v2/games:header" as never, { gameId } as never) as { planningSeconds: number; worldSeconds: number; startingEnergy: number; preset: string };
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`) });
async function noSideways(page: Page, where: string) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  assert.ok(sw <= w + 1, `${where}: the page scrolls sideways (${sw} > ${w})`);
}

const browser = await chromium.launch();
try {
  for (const [label, viewport, who] of [["desktop", { width: 1440, height: 900 }, "carol"], ["phone", { width: 390, height: 844 }, "admin"]] as const) {
    const { context, page, errors } = await signIn(browser, who, viewport);

    // ---- the rule gallery
    await page.getByTestId("link-rule-gallery").click();
    await page.getByTestId("page-rule-gallery").waitFor();
    await assertNoSteps(page, `${label}: the rule gallery`);
    const beginner = page.getByTestId("section-beginner");
    assert.ok(await beginner.locator("[data-testid^=tile-]").count() >= 4, "the beginner rules are listed");
    await noSideways(page, `${label} gallery`);
    await shot(page, `gallery-${label}`);
    await page.getByTestId("button-board-line-q").click();
    await page.waitForURL(/board=line-q/);
    await page.getByTestId("button-board-line-z").click();
    await page.getByTestId("link-family-triangle-area").click();
    // A line rule's page offers only line boards (round 6: "Grids" was offered on a line-only rule).
    await page.getByTestId("board-picker").waitFor();
    assert.equal(await page.getByTestId("button-board-grid-4-d10").count(), 0, "no grid board on a line rule's page");
    await page.getByTestId("page-rule-family").waitFor();
    const card = page.getByTestId("text-family-card");
    await card.getByText(/area as close as possible to 4\./).waitFor();
    await page.getByTestId("select-family-params").selectOption("2");
    await card.getByText(/area as close as possible to 8\./).waitFor();
    await page.waitForURL(/params=2/);
    await page.getByTestId("radio-tie-breaker-even").check();
    await card.getByText(/legs as close to equal/).waitFor();
    await page.getByTestId("goal-card").getByText(/A worked example/).first().waitFor();
    await assertNoSteps(page, `${label}: a rule's gallery page`);
    // A rule a setup deals: its goal card's parts on their rulers and the moves that would make the example rarer.
    await page.goto(`${SITE}/rule-gallery/prime-landing`);
    await page.getByTestId("goal-card").getByText(/What would make it rarer|No single move/).first().waitFor({ timeout: 15_000 });
    await assertNoSteps(page, `${label}: a dealt rule's gallery page`);
    await page.goBack();
    await page.getByTestId("text-family-card").getByText(/legs as close to equal/).waitFor();
    await noSideways(page, `${label} rule page`);
    await shot(page, `gallery-${label}-family`);
    // The link opens the same rule again.
    await page.reload();
    await card.getByText(/to 8\. Tie-breaker: make the two legs/).waitFor();
    await page.goto(`${SITE}/rule-gallery/no-such-rule`);
    await page.getByTestId("empty-rule-family").waitFor();
    console.log(`${label}: gallery ok`);

    // ---- the room's setup picker and settings
    await page.goto(`${SITE}/`);
    await page.getByTestId("button-create-room").first().click();
    await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
    const next = page.getByTestId("section-next-game");
    await next.getByTestId("radio-setup-lines-beginner").waitFor();
    assert.ok(await next.getByTestId("radio-setup-lines-beginner").isChecked(), "a new room plays the beginner setup");
    const lab = await next.getByTestId("setup-group-lab").count();
    if (who !== "admin") assert.equal(lab, 0, "a player is never offered the Lab");
    else console.log(`${label}: Lab group ${lab ? "shown" : "absent (no Lab preset deployed)"} for an admin`);
    await next.getByTestId("setup-lines-beginner-bidding").click();
    await page.waitForFunction(() => (document.querySelector("[data-testid=radio-setup-lines-beginner-bidding]") as HTMLInputElement | null)?.checked === true);
    await next.getByTestId("setup-lines-beginner").click();
    await page.waitForFunction(() => (document.querySelector("[data-testid=radio-setup-lines-beginner]") as HTMLInputElement | null)?.checked === true);
    // A number the server would refuse is explained, and nothing is sent.
    await next.getByTestId("input-setting-planningSeconds").fill("2");
    await next.getByTestId("error-setting-planningSeconds").waitFor();
    assert.ok(await next.getByTestId("button-save-settings").isDisabled(), "a refused number cannot be saved");
    await next.getByTestId("input-setting-planningSeconds").fill("5");
    await next.getByTestId("input-setting-worldMinutes").fill("1.5");
    await next.getByTestId("input-setting-startingEnergy").fill("777");
    await next.getByTestId("button-save-settings").click();
    await next.getByTestId("text-next-game-summary").getByText(/5 s to plan · 1\.5 min game · 777 ⚡ to start/).waitFor({ timeout: 15_000 });
    await next.getByTestId("button-reset-settings").waitFor();
    await noSideways(page, `${label} room`);
    await shot(page, `room-${label}-settings`);
    console.log(`${label}: setup and settings saved`);

    // ---- the next game takes the settings
    await page.getByTestId("button-practice-game").click();
    await page.waitForURL(/\/games\//, { timeout: 30_000 });
    const gameId = page.url().split("/").at(-1)!.split("?")[0]!;
    const h = await header(page, gameId);
    assert.deepEqual({ planning: h.planningSeconds, world: h.worldSeconds, energy: h.startingEnergy, preset: h.preset }, { planning: 5, world: 90, energy: 777, preset: "lines-beginner" });
    console.log(`${label}: the game started with 5 s planning, 90 s of world, 777 ⚡`);

    // ---- What if, during the live game
    await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });
    if (label === "phone") {
      await page.getByTestId("button-jump-objects").click();
      await page.locator("[data-testid^=row-line-]").first().waitFor({ state: "visible", timeout: 30_000 });
    }
    await page.locator("[data-testid^=row-line-]").first().click();
    await page.getByTestId("button-open-what-if").click();
    const whatIf = page.getByTestId("pane-what-if");
    await whatIf.getByTestId("what-if-result").waitFor({ timeout: 15_000 });
    await assertNoSteps(page, `${label}: the game with What if`);
    // Owner decision 23: no steps; the rarity says its chance.
    assert.doesNotMatch(await whatIf.getByTestId("what-if-result").innerText(), /\bstep\b/i);
    if (await whatIf.getByTestId("text-what-if-rarity").count()) {
      assert.match(await whatIf.getByTestId("text-what-if-rarity").innerText(), /Your rarity\s*[\d.]+ bits \(1 in [^)]+ by chance\) → [\d.]+ bits \(1 in [^)]+ by chance\)/);
    }
    assert.match(await whatIf.getByTestId("text-what-if-charge").innerText(), /An agent would spend about [\d.]+ ⚡/);
    assert.match(await whatIf.getByTestId("text-what-if-after").innerText(), /It would move the line up 1:\s+y =/);
    await whatIf.getByTestId("input-what-if-k").fill("abc");
    await whatIf.getByTestId("text-what-if-error").getByText(/Type a number/).waitFor();
    await whatIf.getByTestId("input-what-if-k").fill("−2");
    await whatIf.getByTestId("text-what-if-after").getByText(/down 2/).waitFor();
    await whatIf.getByTestId("select-what-if-change").selectOption("cart.mirror");
    await whatIf.getByTestId("select-what-if-axis").selectOption("y");
    await whatIf.getByTestId("what-if-result").or(whatIf.getByTestId("text-what-if-error")).first().waitFor();
    assert.match(await page.getByTestId("text-phase").innerText(), /running/i, "the what-if was tried during the live game");
    await whatIf.scrollIntoViewIfNeeded();
    await noSideways(page, `${label} game`);
    await shot(page, `what-if-${label}`);
    console.log(`${label}: what-if ok`);

    assert.deepEqual(errors, [], `${label}: no page errors`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("ok - the rule gallery, the setup picker and settings, and the what-if pane at desktop and phone");
