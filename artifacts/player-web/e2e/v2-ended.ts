/**
 * Nothing disappears when a game ends (v1's rule: "The entire structure of the game should continue to be inspectable in
 * frozen state after the game ends"; docs/engine-v2/v1-audit.md item 11). A short practice game on lines, then on
 * grids, is played to its natural end at desktop against the LIVE local engine; then every pane of the ended game is
 * opened from the dock's own pane menu and must hold its content: the goal, the objects and one object with its views,
 * the act log and the public log (now naming who moved), the agents and their code, the chat, the leaderboard, the
 * assistant, the charts and the rules. The same URL then serves the replay.
 *
 *   pnpm --filter @workspace/player-web run e2e:ended        (SKIP_DEPLOY=1 reuses the uploaded build)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
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

/** The playtester's phone (scripts/persona-walk/server.js): touch, a mobile layout and Safari's user agent. */
const PHONE = { isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };

async function signIn(browser: any, who: string, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(viewport.width < 768 ? PHONE : {}) });
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

/** The room's next game: this preset, short, through its owner's own session (the room.settings affordance). */
async function setUp(page: Page, code: string, preset: string) {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  const { roomId } = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  for (const args of [{ preset }, { overrides: { planningSeconds: 5, worldSeconds: 30 } }]) {
    const out = await client.mutation("v2/ops/room:settings" as never, { args, roomId } as never) as { ok: boolean; error?: { message: string } };
    assert.ok(out.ok, `room.settings: ${out.error?.message}`);
  }
}

/** Opens a pane from the dock's own menu (as a player would), unless it is already open; answers its section. */
async function open(page: Page, pane: string) {
  const section = page.getByTestId(`pane-${pane}`);
  // Already open (perhaps behind another tab): bring it to the front; else open it from a pane's menu.
  await page.keyboard.press("Escape");
  // A narrow tab is mostly its "…" button: click its title, at the left edge.
  if (await page.getByTestId(`tab-${pane}`).count()) await page.getByTestId(`tab-${pane}`).click({ position: { x: 6, y: 10 } });
  else if (!await section.count() && pane === "assistant" && await page.getByTestId("button-assistant-sheet").count()) await page.getByTestId("button-assistant-sheet").click();
  else if (!await section.count()) {
    await page.locator("[data-testid^=button-pane-menu-]").first().click();
    await page.getByTestId(`button-open-pane-${pane}`).click();
  }
  await section.waitFor({ timeout: 15_000 });
  return section;
}

async function endedGame(page: Page, preset: string, noun: string) {
  const label = preset.split("-")[0]!;
  await page.goto(`${SITE}/`);
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  const code = page.url().split("/").at(-1)!;
  await setUp(page, code, preset);
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
  const gameUrl = page.url().split(/[?#]/)[0]!;
  await page.getByTestId("button-summon-first").click();
  await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
  const startNow = page.getByTestId("button-start-world");
  if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
  await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });
  // Something said while it ran, to find again after the end.
  const said = `before the end on ${label} ${Date.now().toString(36)}`;
  const chat = await open(page, "public-chat");
  await chat.getByTestId("input-chat").fill(said);
  await chat.getByTestId("button-send-chat").click();
  await chat.getByText(said).waitFor({ timeout: 15_000 });
  await page.getByTestId("text-phase").getByText("Ended").waitFor({ timeout: 120_000 });
  await page.getByTestId("pane-results").getByText(/You finished \S+ of 3 with/).waitFor({ timeout: 20_000 });
  console.log(`${label}: the game ended`);

  const checked: string[] = [];
  const ok = (pane: string) => checked.push(pane);
  const noErrors = async (what: string) => assert.equal(await page.getByTestId("pane-error").count(), 0, `${label}: ${what}: no pane failed: ${await page.getByTestId("pane-error").allInnerTexts()}`);

  // The goal.
  const card = await open(page, "my-card");
  await card.getByTestId("goal-card").waitFor();
  assert.ok((await card.innerText()).trim().length > 40, `${label}: the goal card is there`);
  ok("my-card");
  // The objects, then one object with its views, frozen.
  const objects = await open(page, "objects");
  const row = objects.locator("[data-testid^=row-line-]").first();   // the rows keep one test id on every board
  await row.waitFor({ timeout: 15_000 });
  ok("objects");
  await row.click();
  await page.locator("[data-testid=pane-object], [data-testid=tab-object]").first().waitFor({ timeout: 15_000 });
  const one = await open(page, "object");
  await one.locator(".v2v").first().waitFor({ timeout: 15_000 });
  assert.ok((await one.innerText()).trim().length > 40, `${label}: one ${noun} shows its views`);
  ok("object");
  // Its candidates, frozen at the end state: the priced moves the annotations offer, and What if on it.
  const options = await one.locator(".v2v-move-option").count();
  console.log(`${label}: one ${noun}: ${options} candidate moves shown after the end`);
  ok(`object candidates (${options})`);
  const whatIf = await open(page, "what-if");
  await page.waitForTimeout(500);
  assert.ok((await whatIf.innerText()).trim().length > 20, `${label}: What if has content after the end`);
  console.log(`${label}: What if after the end: ${(await whatIf.innerText()).replace(/\s+/g, " ").slice(0, 160)}`);
  ok("what-if");
  // The act log, then the public log: after the end, another player's move names its mover.
  const feed = await open(page, "feed");
  await feed.locator("[data-testid=text-move-line], [data-testid=text-tug-line]").first().waitFor({ timeout: 15_000 });
  ok("feed");
  await feed.getByTestId("button-feed-mode-all").click();
  await feed.locator("[data-testid^=row-log]").first().waitFor({ timeout: 15_000 });
  const log = await feed.locator("[data-testid=text-log-line]").allInnerTexts();
  assert.ok(log.length > 0, `${label}: the public log has rows`);
  for (const l of log) assert.doesNotMatch(l, new RegExp(`^(${noun[0]!.toUpperCase()}${noun.slice(1)} \\d+ changed|Another player)|\\babout \\d`), `${label}: after the end the log is attributed and exact: ${l}`);
  console.log(`${label}: public log after the end: ${log[0]}`);
  ok("public log");
  // The agents and their code.
  const agents = await open(page, "agents");
  const agent = agents.locator("[data-testid^=row-agent-]").first();
  await agent.waitFor({ timeout: 15_000 });
  await agent.locator("[data-testid^=details-agent-code-] summary").click();
  const source = agent.locator("[data-testid^=text-agent-code-]");
  await source.waitFor({ timeout: 15_000 });
  assert.match(await source.innerText(), /\b(function|def|const|return)\b/, `${label}: the agent's code is readable`);
  // After the end nothing is edited or put back; how energy works is still there to read.
  assert.equal(await agent.locator("[data-testid^=button-agent-edit-], [data-testid^=button-put-back-]").count(), 0, `${label}: no edit after the end`);
  await agents.getByTestId("details-energy-how").locator("summary").click();
  assert.match(await agents.getByTestId("details-energy-how").innerText(), /power/, `${label}: how energy works`);
  ok("agents");
  // The chat, the leaderboard, the charts, the rules, the assistant, the player's own panels.
  const chatPane = await open(page, "public-chat");
  await chatPane.getByText(said).waitFor({ timeout: 15_000 });
  // v1's chat filters: your own message is a person's, not an AI player's, and not a mention of you.
  await chatPane.getByTestId("button-chat-filter-ai").click();
  assert.equal(await chatPane.getByText(said).count(), 0, `${label}: AI players' messages leave yours out`);
  await chatPane.getByTestId("button-chat-filter-people").click();
  await chatPane.getByText(said).waitFor({ timeout: 5_000 });
  await chatPane.getByTestId("button-chat-filter-all").click();
  ok("public-chat");
  // The leaderboard keeps its race chart; the final table is Results' (one table, not three: persona walk, round 5).
  const race = await open(page, "race");
  await race.getByTestId("race-chart").waitFor({ timeout: 15_000 });
  await race.getByTestId("race-ended-note").waitFor();
  ok("race");
  for (const pane of ["points-over-time", "others-care", "rules", "overview", "assistant", "my-panels"]) {
    const s = await open(page, pane);
    await page.waitForTimeout(300);
    assert.ok((await s.innerText()).trim().length > 20, `${label}: ${pane} has content after the end`);
    if (pane === "rules") {
      // v1's "Copy game rules for an AI": copied, or (no clipboard here) shown to copy by hand, the primer included.
      await s.getByTestId("button-copy-rules-ai").click();
      await page.getByText("Rules copied").or(s.getByTestId("text-rules-ai")).first().waitFor({ timeout: 5_000 });
      if (await s.getByTestId("text-rules-ai").count()) assert.match(await s.getByTestId("text-rules-ai").inputValue(), /## Writing agents[\s\S]*look\(/, `${label}: the rules for an AI carry the primer`);
    }
    ok(pane);
  }
  const results = await open(page, "results");
  await results.getByText(/You finished/).waitFor();
  assert.equal(await results.locator("[data-testid^=row-result-]").count(), 3, `${label}: the final standings, every player`);
  // Never a Results page without advice (round 12: Exact Change's said nothing): "Try next game" is there.
  await results.getByTestId("text-summary-next").waitFor({ timeout: 15_000 });
  console.log(`${label}: try next game: ${(await results.getByTestId("text-summary-next").innerText()).replace(/\s+/g, " ").slice(0, 140)}`);
  ok("results");
  await noErrors("every pane");
  await page.screenshot({ path: path.join(shots, `ended-${label}.png`) });

  // The same URL serves the replay.
  await page.goto(`${gameUrl}?replay`);
  await page.locator('[data-testid="replay-bar"][data-status="ready"]').waitFor({ timeout: 30_000 });
  ok("replay at the same URL");
  console.log(`${label}: after the end: ${checked.join(", ")}`);
}

/**
 * A phone after the buzzer (playtest round 26, 08): the page opens at "How the game went", scrolling up from the bottom
 * never jumps back, "What earned your points" can be reached, and "See it line by line" opens Lines.
 */
async function phoneEnd(browser: any) {
  const { context, page, errors } = await signIn(browser, "bob", { width: 390, height: 844 });
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  await setUp(page, page.url().split("/").at(-1)!, "lines-beginner");
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
  await page.getByTestId("button-summon-first").click();
  await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
  const startNow = page.getByTestId("button-start-world");
  if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
  await page.getByTestId("text-phase").getByText("Ended").waitFor({ timeout: 120_000 });
  const scroller = page.getByTestId("dock-stacked");
  await page.getByTestId("pane-results").getByText(/You finished/).waitFor({ timeout: 20_000 });
  assert.equal(await scroller.evaluate((el: HTMLElement) => el.scrollTop), 0, "phone: the end opens at How the game went");
  await page.getByTestId("text-summary-next").waitFor({ timeout: 15_000 });
  // The playtester's steps (round 26/27): the top bar's "See it line by line", then "How the game went" from the row of
  // pane names, then the mouse wheel at the centre of the screen, 700 px at a time.
  await page.getByTestId("button-line-by-line-bar").click();
  await page.getByTestId("pane-objects").locator("[data-testid^=row-line-]").first().waitFor({ timeout: 15_000 });
  await page.getByTestId("button-jump-results").click();
  await page.waitForTimeout(800);
  const earned = page.getByTestId("pane-results").getByText("What earned your points");
  let seen = false, last = -1;
  for (let i = 0; i < 20 && !seen; i++) {
    await page.mouse.move(195, 422);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(500);
    const box = await earned.boundingBox();
    // Reached once it has come into view or past it: a 700 px step is wider than the pane under the sticky header.
    seen = !!box && box.y < 844;
    const top = await scroller.evaluate((el: HTMLElement) => el.scrollTop);
    assert.ok(top >= last, `phone: the wheel moves the page down (${last} → ${top}), never back`);
    last = top;
  }
  if (!seen) await page.screenshot({ path: path.join(shots, "ended-phone-missed.png") });
  const room = await scroller.evaluate((el: HTMLElement) => `${el.scrollTop} of ${el.scrollHeight - el.clientHeight}`);
  assert.ok(seen, `phone: the wheel reaches What earned your points (scrolled ${room}, ${await earned.count()} found)`);
  await page.screenshot({ path: path.join(shots, "ended-phone.png") });
  assert.deepEqual(errors, [], "phone: no page errors");
  await context.close();
  console.log("phone: after the buzzer the page opens at the result, scrolls without jumping, and See it line by line opens Lines");
}

const browser = await chromium.launch();
try {
  await phoneEnd(browser);
  const { context, page, errors } = await signIn(browser, "admin");   // AI (the assistant) runs only in rooms an administrator owns
  await endedGame(page, "lines-beginner", "line");
  await endedGame(page, "grids-beginner", "grid");
  assert.deepEqual(errors, [], "no page errors");
  await context.close();
} finally {
  await browser.close();
}
console.log("ok - every pane of an ended game (lines and grids) still opens with its content, and the URL serves the replay");
