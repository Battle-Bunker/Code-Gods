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

async function signIn(browser: any, who: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
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
  ok("agents");
  // The chat, the leaderboard, the charts, the rules, the assistant, the player's own panels.
  await (await open(page, "public-chat")).getByText(said).waitFor({ timeout: 15_000 });
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
    ok(pane);
  }
  const results = await open(page, "results");
  await results.getByText(/You finished/).waitFor();
  assert.equal(await results.locator("[data-testid^=row-result-]").count(), 3, `${label}: the final standings, every player`);
  ok("results");
  await noErrors("every pane");
  await page.screenshot({ path: path.join(shots, `ended-${label}.png`) });

  // The same URL serves the replay.
  await page.goto(`${gameUrl}?replay`);
  await page.locator('[data-testid="replay-bar"][data-status="ready"]').waitFor({ timeout: 30_000 });
  ok("replay at the same URL");
  console.log(`${label}: after the end: ${checked.join(", ")}`);
}

const browser = await chromium.launch();
try {
  const { context, page, errors } = await signIn(browser, "admin");   // AI (the assistant) runs only in rooms an administrator owns
  await endedGame(page, "lines-beginner", "line");
  await endedGame(page, "grids-beginner", "grid");
  assert.deepEqual(errors, [], "no page errors");
  await context.close();
} finally {
  await browser.close();
}
console.log("ok - every pane of an ended game (lines and grids) still opens with its content, and the URL serves the replay");
