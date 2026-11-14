/**
 * The replay of an ended line game (integration plan W5-5), in the app against the LIVE local engine
 * (`pnpm --filter @workspace/engine dev`). A short practice game is played to its natural end at desktop (1440×900),
 * then its replay is opened from the results ("Watch the replay"); at phone width (390×844) the same game's replay is
 * opened from the room's past games. At each width: the replay starts empty, a step forward lands after a move, a
 * step back returns, the slider sent to its end shows the standings the results showed, and the page never scrolls
 * sideways.
 *
 *   pnpm --filter @workspace/player-web run e2e:replay        (SKIP_DEPLOY=1 reuses the uploaded build)
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

/** The room's next game, shortened, through its owner's own session (the room.settings affordance). */
async function shorten(page: Page, code: string) {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  const found = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  const out = await client.mutation("v2/ops/room:settings" as never, { args: { overrides: { planningSeconds: 5, worldSeconds: 30 } }, roomId: found.roomId } as never) as { ok: boolean; error?: { message: string } };
  assert.ok(out.ok, `room.settings: ${out.error?.message}`);
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`) });

/** memberId → points as a list of standings rows shows them. */
async function pointsBy(page: Page, rowPrefix: string): Promise<Record<string, string>> {
  return await page.locator(`[data-testid^="${rowPrefix}"]`).evaluateAll((rows: HTMLElement[], prefix: string) =>
    Object.fromEntries(rows.map(r => [r.dataset.testid!.slice(prefix.length), (r.querySelector(".tabular-nums:not(.w-10)") as HTMLElement | null)?.innerText ?? ""])), rowPrefix);
}

const applied = async (page: Page) => Number(await page.getByTestId("replay-bar").getAttribute("data-applied"));
async function waitApplied(page: Page, ok: (n: number) => boolean, what: string) {
  const until = Date.now() + 15_000;
  for (;;) {
    const n = await applied(page);
    if (ok(n)) return n;
    if (Date.now() > until) throw new Error(`replay cursor: ${what} (at ${n})`);
    await page.waitForTimeout(100);
  }
}

/** Steps, seeks to the end with the slider, and checks the standings against the results'. */
async function driveReplay(page: Page, label: string, final: Record<string, string>, distinctRules: boolean) {
  const bar = page.getByTestId("replay-bar");
  await page.locator('[data-testid="replay-bar"][data-status="ready"]').waitFor({ timeout: 60_000 });
  assert.match(await page.getByTestId("text-phase").innerText(), /replay/i);
  const end = Number(await bar.getAttribute("data-end"));
  assert.ok(end > 10, `${label}: the file holds the game's events (${end})`);
  await waitApplied(page, n => n === 0, "opens at the start");
  await page.getByTestId("race-empty").waitFor();

  await page.getByTestId("button-replay-forward").click();
  const first = await waitApplied(page, n => n > 0, "a step forward moves on");
  await page.locator("[data-testid^=row-line-]").first().waitFor({ timeout: 10_000 });
  await page.getByTestId("button-replay-forward").click();
  const second = await waitApplied(page, n => n > first, "a second step moves on again");
  await page.getByTestId("button-replay-back").click();
  await waitApplied(page, n => n === first, "a step back returns to the move before");
  console.log(`${label}: stepped ${first} → ${second} → ${first} of ${end}`);
  await shot(page, `replay-${label}-step`);

  // Play at 8×, then pause: it stops where the playhead was, and stays there.
  await page.getByTestId("select-replay-speed").selectOption("8");
  await page.getByTestId("button-replay-play").click();
  await waitApplied(page, n => n > second, "playing moves on");
  await page.getByTestId("button-replay-pause").click();
  await page.getByTestId("button-replay-play").waitFor();
  const paused = await applied(page);
  await page.waitForTimeout(800);
  assert.equal(await applied(page), paused, `${label}: a paused replay stays put`);
  assert.ok(paused > second, `${label}: the pause kept the playhead (${paused})`);

  // Through another player's eyes: their points (and their rule, in the goal card).
  const as = page.getByTestId("select-replay-as");
  const other = as.locator("option:not(:checked)").first();
  const name = (await other.innerText()).trim();
  const card = page.getByTestId("goal-card").locator(".v2v-goal-card");
  const myCard = await card.innerText();
  await as.selectOption(await other.getAttribute("value"));
  await page.getByTestId("text-my-total").getByText(`${name}:`).waitFor({ timeout: 10_000 });
  const theirCard = await card.innerText();
  console.log(`${label}: as ${name}: "${theirCard.slice(0, 70)}" (yours: "${myCard.slice(0, 70)}")`);
  // Two seats can be dealt the same rule (then the same card): only distinct rules must read differently.
  if (distinctRules) assert.notEqual(theirCard, myCard, `${label}: watching as another player shows their rule`);
  await as.selectOption(await as.locator("option", { hasText: "(you)" }).getAttribute("value"));
  await page.getByTestId("text-my-total").getByText("You:").waitFor({ timeout: 10_000 });

  const slider = page.getByTestId("input-replay-seek");
  await slider.focus();
  await slider.press("End");
  await waitApplied(page, n => n === end, "the slider's end is the game's end");
  await page.getByTestId("leaderboard").waitFor();
  const shown = await pointsBy(page, "row-standing-");
  assert.deepEqual(shown, final, `${label}: the replay's final standings are the results'`);
  assert.match(await page.getByTestId("text-replay-clock").innerText(), /^0:3\d of 0:3\d$/, "the clock reads the game's end");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `${label}: no sideways scroll (${overflow}px)`);
  await shot(page, `replay-${label}-end`);
  console.log(`${label}: the end matches the results: ${JSON.stringify(shown)}`);
}

const browser = await chromium.launch();
try {
  // Desktop: play a short game to its natural end, then "Watch the replay" from the results.
  const desk = await signIn(browser, "alice", { width: 1440, height: 900 });
  let page = desk.page;
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  const code = page.url().split("/").at(-1)!;
  await shorten(page, code);
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
  const gameId = decodeURIComponent(page.url().split("/games/")[1]!.split(/[?#]/)[0]!);
  await page.getByTestId("button-summon-first").click();
  await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
  const startNow = page.getByTestId("button-start-world");
  if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
  await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });
  await page.getByTestId("text-phase").getByText("Ended").waitFor({ timeout: 120_000 });
  const results = page.getByTestId("pane-results");
  await results.getByText(/You finished \S+ of 3 with/).waitFor({ timeout: 20_000 });
  const final = await pointsBy(page, "row-result-");
  assert.equal(Object.keys(final).length, 3, "three players in the results");
  console.log(`desktop: game ${gameId} ended: ${JSON.stringify(final)}`);
  const rules = await page.evaluate(async (id: string) => {
    const { token } = await (await fetch("/api/auth/convex/token")).json() as { token: string };
    const file = await (await fetch(`/api/v2/replay/${id}`, { headers: { Authorization: `Bearer ${token}` } })).json() as { rules: { family: string; ruleKey: string }[] };
    return file.rules.map(r => r.ruleKey);
  }, gameId);
  console.log(`desktop: the stored replay holds every player's rule: ${rules.join(", ")}`);
  assert.equal(rules.length, 3, "every player's rule is in the stored replay");
  const distinct = new Set(rules).size === rules.length;
  await results.getByTestId("button-watch-replay").click();
  await driveReplay(page, "desktop", final, distinct);
  assert.deepEqual(desk.errors, [], "desktop: no page errors");
  await desk.context.close();

  // Phone: the same game's replay from the room's past games.
  const phone = await signIn(browser, "alice", { width: 390, height: 844 });
  page = phone.page;
  await page.goto(`${SITE}/rooms/${code}`);
  await page.getByTestId(`button-replay-${gameId}`).click();
  await page.waitForURL(new RegExp(`/games/${gameId}`), { timeout: 15_000 });
  await driveReplay(page, "phone", final, distinct);
  await page.getByTestId("button-replay-close").click();
  await page.getByTestId("text-phase").getByText("Ended").waitFor({ timeout: 10_000 });
  assert.equal(await page.getByTestId("replay-bar").count(), 0, "closing the replay leaves the ended game");
  assert.deepEqual(phone.errors, [], "phone: no page errors");
  await phone.context.close();
} finally {
  await browser.close();
}
console.log("ok - an ended line game's replay steps, seeks to the end and matches the results at desktop and phone");
