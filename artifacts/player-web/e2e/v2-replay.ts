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

/**
 * Whether the running engine's functions know `replay.watchAs` (the local engine may run another checkout's functions):
 * it is applied once through the human's own session, for their own seat, which changes nothing they see.
 */
async function serverKnowsWatchAs(page: Page, code: string, gameId: string): Promise<boolean> {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  const { roomId } = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  const { me } = await client.query("v2/games:header" as never, { gameId } as never) as { me: string };
  // The bar can show before replay.open's write lands in the stored view: a few tries while it says "open one first".
  let out: { ok: boolean; error?: { code: string; message: string; fix?: string } } = { ok: false };
  for (let i = 0; i < 20; i++) {
    out = await client.mutation("v2/ops/view:apply" as never, { id: "replay.watchAs", args: { memberId: me }, roomId, gameId, replay: true } as never) as typeof out;
    if (out.ok || out.error?.fix !== "replay.open") break;
    await new Promise(done => setTimeout(done, 250));
  }
  if (!out.ok && out.error?.code !== "unknown") throw new Error(`replay.watchAs: ${out.error?.message}`);
  return out.ok;
}

/** A pane opened from a pane's own menu (or brought to the front of its tabs). */
async function openPane(page: Page, pane: string) {
  const section = page.getByTestId(`pane-${pane}`);
  if (await page.getByTestId(`tab-${pane}`).count()) await page.getByTestId(`tab-${pane}`).click({ position: { x: 6, y: 10 } });
  else if (!await section.count()) {
    await page.locator("[data-testid^=button-pane-menu-]").first().click();
    await page.getByTestId(`button-open-pane-${pane}`).click();
  }
  await section.waitFor({ timeout: 15_000 });
  return section;
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
async function driveReplay(page: Page, label: string, final: Record<string, string>, distinctRules: boolean, watchAs: boolean) {
  const bar = page.getByTestId("replay-bar");
  await page.locator('[data-testid="replay-bar"][data-status="ready"]').waitFor({ timeout: 60_000 });
  assert.match(await page.getByTestId("text-phase").innerText(), /replay/i);
  const end = Number(await bar.getAttribute("data-end"));
  assert.ok(end > 10, `${label}: the file holds the game's events (${end})`);
  await waitApplied(page, n => n === end, "opens on the final board (v1)");
  await page.getByTestId("button-replay-start").click();
  await waitApplied(page, n => n === 0, "the start");
  await page.getByTestId("race-empty").waitFor();

  await page.getByTestId("button-replay-forward").click();
  const first = await waitApplied(page, n => n > 0, "a step forward moves on");
  await page.locator("[data-testid^=row-line-]").first().waitFor({ timeout: 10_000 });
  await page.getByTestId("button-replay-forward").click();
  const second = await waitApplied(page, n => n > first, "a second step moves on again");
  await page.getByTestId("button-replay-back").click();
  await waitApplied(page, n => n === first, "a step back returns to the move before");
  console.log(`${label}: stepped ${first} → ${second} → ${first} of ${end}`);
  // Key moments (v1's "◆ prev / next ◆"): each summon and lead change is marked on the slider; next ◆ goes to the
  // next one after the playhead, ◆ prev back, and Shift+→ does what next ◆ does.
  const marks = page.locator("[data-testid^=replay-mark-]");
  assert.ok(await marks.count() > 0, `${label}: the replay marks its key moments (at least the summons)`);
  assert.match(await page.getByTestId("text-replay-event").innerText(), new RegExp(`^event ${first} of ${end}$`));
  if (await page.getByTestId("button-replay-next-moment").isEnabled()) {
    await page.getByTestId("button-replay-next-moment").click();
    const moment = await waitApplied(page, n => n > first, "next ◆ moves to a key moment");
    await page.getByTestId("button-replay-prev-moment").click().catch(() => {});
    const back = await waitApplied(page, n => n < moment, "◆ prev moves back");
    // The keys are the page's, not a focused button's (a pressed button keeps the focus).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Shift+ArrowRight");
    await waitApplied(page, n => n > back, "Shift+→ jumps forward to a key moment");
    console.log(`${label}: ${await marks.count()} key moments; next ◆ went to ${moment}`);
    // Back to where the steps left it, for the playing checks below.
    await page.keyboard.press("Home");
    await waitApplied(page, n => n === 0, "Home returns to the start");
    // v1's slider keys: ↑/↓ step one event, PageUp/PageDown a tenth of the game; [ and ] change the speed.
    const slider = page.getByTestId("input-replay-seek");
    await slider.focus();
    await page.keyboard.press("ArrowUp");
    await waitApplied(page, n => n === 1, "↑ on the slider steps one event");
    await page.keyboard.press("PageUp");
    const tenth = await waitApplied(page, n => n > 1, "PageUp on the slider seeks further");
    assert.ok(tenth >= Math.floor(end / 10), `${label}: PageUp moves about a tenth of the game (${tenth} of ${end})`);
    await page.keyboard.press("ArrowDown");
    await waitApplied(page, n => n === tenth - 1, "↓ on the slider steps back one event");
    await slider.blur();
    const speedBefore = await page.getByTestId("select-replay-speed").inputValue();
    await page.keyboard.press("]");
    await page.waitForFunction((was: string) => (document.querySelector("[data-testid=select-replay-speed]") as HTMLSelectElement | null)?.value !== was, speedBefore, { timeout: 10_000 });
    await page.keyboard.press("[");
    await page.waitForFunction((was: string) => (document.querySelector("[data-testid=select-replay-speed]") as HTMLSelectElement | null)?.value === was, speedBefore, { timeout: 10_000 });
    await page.keyboard.press("Home");
    await waitApplied(page, n => n === 0, "Home returns to the start");
    // v1's event list, open in the Timeline: each row a moment; a click goes there.
    const row = page.getByTestId("replay-events").locator("[data-testid^=replay-event-]").nth(3);
    const at = Number((await row.getAttribute("data-testid"))!.slice("replay-event-".length));
    await row.click();
    await waitApplied(page, n => n === at, "a click on an event goes there");
    assert.match(await page.getByTestId("replay-events").textContent() ?? "", /(Line|Grid) \d+ is born|summoned /);
    // Back where the steps above left it (one step from the start), for the playing checks below.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Home");
    await waitApplied(page, n => n === 0, "Home returns to the start");
    await page.getByTestId("button-replay-forward").click();
    await waitApplied(page, n => n === first, "one step from the start, as before");
  }
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
  // v1's score chart: the whole game's race with the playhead on it; a click on the chart goes there.
  const race = page.getByTestId("replay-race");
  if (await race.count()) {
    await race.getByTestId("chart-playhead").waitFor({ state: "attached", timeout: 10_000 });
    // Behind a tab in the replay's arrangement (feed | race): bring it to the front.
    if (!await race.isVisible() && await page.getByTestId("tab-race").count()) await page.getByTestId("tab-race").click({ position: { x: 6, y: 10 } });
    if (!await race.isVisible() && await page.getByTestId("button-jump-race").count()) await page.getByTestId("button-jump-race").click();
    // (A vertical line has no width, so Playwright never calls it visible: the chart is what must show.)
    await race.locator("svg").first().waitFor({ timeout: 10_000 });
    const before = await applied(page);
    const box = (await race.locator("svg").first().boundingBox())!;
    await race.locator("svg").first().click({ position: { x: box.width * 0.9, y: box.height / 2 } });
    await waitApplied(page, n => n !== before, "a click on the race chart seeks");
  } else console.log(`${label}: the race pane is not in this replay's arrangement`);
  // v1's keys (focus off the speed menu first: keys never act inside a field): → steps, Home goes to the start, space plays.
  await page.getByTestId("text-replay-clock").click();
  await page.keyboard.press("ArrowRight");
  await waitApplied(page, n => n > paused, "→ steps forward");
  await page.keyboard.press("Home");
  await waitApplied(page, n => n === 0, "Home goes to the start");
  await page.keyboard.press(" ");
  await page.locator('[data-testid="replay-bar"][data-playing]').waitFor({ timeout: 5_000 });
  await page.keyboard.press(" ");
  await page.getByTestId("button-replay-play").waitFor();
  if (label === "desktop") {
    // "Download": the game's whole record as a file.
    const [file] = await Promise.all([page.waitForEvent("download", { timeout: 15_000 }), page.getByTestId("button-replay-download").click()]);
    assert.match(file.suggestedFilename(), /^code-gods-replay-.+\.json$/, `${label}: the replay downloads`);
  }
  // Every pane holds up once moves show (round 9: "What just changed" failed with "o.notes is not iterable").
  const feed = page.getByTestId("pane-feed");
  if (await feed.count()) await feed.locator("[data-testid=text-move-line], [data-testid=text-tug-line], [data-testid=feed-empty]").first().waitFor({ timeout: 10_000 });
  assert.equal(await page.getByTestId("pane-error").count(), 0, `${label}: no pane failed: ${await page.getByTestId("pane-error").allInnerTexts()}`);

  // Through another player's eyes: their points (and their rule, in the goal card), kept once the server has it.
  if (!watchAs) console.log(`${label}: SKIPPED watch as: the running engine's functions predate replay.watchAs (it refuses the operation)`);
  else {
    const as = page.getByTestId("select-replay-as");
    const other = as.locator("option:not(:checked)").first();
    const name = (await other.innerText()).trim();
    const card = page.getByTestId("goal-card").getByTestId("text-goal-main");
    const myCard = await card.innerText();
    await as.selectOption(await other.getAttribute("value"));
    await page.getByTestId("text-my-total").getByText(`${name}:`).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    assert.match(await page.getByTestId("text-my-total").innerText(), new RegExp(`^${name}:`), `${label}: the server kept the point of view`);
    const theirCard = await card.innerText();
    console.log(`${label}: as ${name}: "${theirCard.slice(0, 70)}" (yours: "${myCard.slice(0, 70)}")`);
    // Two seats can be dealt the same rule (then the same card): only distinct rules must read differently.
    if (distinctRules) assert.notEqual(theirCard, myCard, `${label}: watching as another player shows their rule`);
    await as.selectOption(await as.locator("option", { hasText: "(you)" }).getAttribute("value"));
    await page.getByTestId("text-my-total").getByText("You:").waitFor({ timeout: 10_000 });
  }

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
  // Desktop: play a short game to its natural end; the screen becomes its replay.
  const desk = await signIn(browser, "alice", { width: 1440, height: 900 });
  let page = desk.page;
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  const code = page.url().split("/").at(-1)!;
  await shorten(page, code);
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
  // The URL names the game by its number in the room (short links); the engine's calls below take its id.
  const gameNumber = decodeURIComponent(page.url().split("/games/")[1]!.split(/[?#]/)[0]!);
  const resolver = new ConvexHttpClient(CLOUD);
  resolver.setAuth(await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token));
  const { gameId } = await resolver.query("v2/games:resolve" as never, { room: code, game: gameNumber } as never) as { gameId: string };
  await page.getByTestId("button-summon-first").click();
  await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
  const startNow = page.getByTestId("button-start-world");
  if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
  await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });
  // The moment the game ends the screen is its replay (v1), in this document: the Timeline in the assistant's place,
  // the owner's layout around it, and the results a pane away.
  await page.evaluate(() => { (window as unknown as { sameDoc: boolean }).sameDoc = true; });
  await page.getByTestId("pane-timeline").getByTestId("replay-bar").waitFor({ timeout: 150_000 });
  await page.locator('[data-testid="replay-bar"][data-status="ready"]').waitFor({ timeout: 60_000 });
  assert.ok(await page.evaluate(() => (window as unknown as { sameDoc?: boolean }).sameDoc), "the replay opened without a reload");
  const layout = async () => (await page.locator("[data-testid^=pane-]").evaluateAll((els: HTMLElement[]) => els.map(e => e.dataset.testid).filter(t => /^pane-[a-z-]+$/.test(t!)))).sort();
  const atEnd = await layout();
  for (const pane of ["my-card", "race", "objects", "agents", "timeline"]) assert.ok(atEnd.includes(`pane-${pane}`), `the replay shows ${pane}: ${atEnd}`);
  assert.ok(!atEnd.includes("pane-assistant"), `the Timeline replaces the assistant: ${atEnd}`);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await shot(page, "replay-at-the-end-1920");
  const results = await openPane(page, "results");
  await results.getByText(/You finished/).waitFor({ timeout: 20_000 });
  const final = await pointsBy(page, "row-result-");
  assert.equal(Object.keys(final).length, 3, "three players in the results");
  const { roomId } = await resolver.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  const storedResults = async () => !!(await resolver.query("v2/layout:current" as never, { roomId } as never) as { view: { panes: { pane: string }[] } | null } | null)?.view?.panes.some(p => p.pane === "results");
  for (let i = 0; !await storedResults(); i++) { assert.ok(i < 50, "opening the results never reached the stored view"); await page.waitForTimeout(200); }
  await page.getByTestId("button-close-results").click();
  await page.getByTestId("pane-results").waitFor({ state: "detached", timeout: 10_000 })
    .catch(async (e: Error) => { await shot(page, "replay-results-close-failed"); console.log("TOASTS", await page.locator("[role=status], li[data-state]").allInnerTexts()); throw e; });
  // The close reaches the stored view (what a cold open reads) before the page is reloaded below.
  for (let i = 0; await storedResults(); i++) { assert.ok(i < 50, "the results pane's close never reached the stored view"); await page.waitForTimeout(200); }
  console.log(`desktop: game ${gameId} ended: ${JSON.stringify(final)}`);
  const rules = await page.evaluate(async (id: string) => {
    const { token } = await (await fetch("/api/auth/convex/token")).json() as { token: string };
    // The file is built just after the end: a 404 until then.
    for (let i = 0; i < 100; i++) {
      const r = await fetch(`/api/v2/replay/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) return ((await r.json()) as { rules: { ruleKey: string }[] }).rules.map(x => x.ruleKey);
      await new Promise(done => setTimeout(done, 200));
    }
    throw new Error("the stored replay never arrived");
  }, gameId);
  console.log(`desktop: the stored replay holds every player's rule: ${rules.join(", ")}`);
  assert.equal(rules.length, 3, "every player's rule is in the stored replay");
  const distinct = new Set(rules).size === rules.length;
  // Opened cold, the same ended game is the same screen.
  await page.reload();
  await page.locator('[data-testid="replay-bar"][data-status="ready"]').waitFor({ timeout: 60_000 });
  const cold = await layout();
  assert.deepEqual(cold, atEnd, "opened cold, the ended game shows the same replay screen");
  await shot(page, "replay-cold-1920");
  await page.setViewportSize({ width: 1440, height: 900 });
  const watchAs = await serverKnowsWatchAs(page, code, gameId);
  await driveReplay(page, "desktop", final, distinct, watchAs);
  assert.deepEqual(desk.errors, [], "desktop: no page errors");
  await desk.context.close();

  // Phone: the same game's replay from the room's past games.
  const phone = await signIn(browser, "alice", { width: 390, height: 844 });
  page = phone.page;
  await page.goto(`${SITE}/rooms/${code}`);
  await page.getByTestId(`link-past-game-${gameNumber}`).click();
  await page.waitForURL(new RegExp(`/games/${gameNumber}$`), { timeout: 15_000 });
  await driveReplay(page, "phone", final, distinct, watchAs);
  // The old replay route: ?replay on the game's URL leaves the URL.
  await page.goto(`${SITE}/rooms/${code}/games/${gameNumber}?replay`);
  await page.locator('[data-testid="replay-bar"][data-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForURL(u => !new URL(u).searchParams.has("replay"), { timeout: 10_000 });
  // A moment link ("Copy a link to this moment") opens the replay at that world time, watched as that player.
  const otherId = await page.getByTestId("select-replay-as").locator("option:not(:checked)").first().getAttribute("value");
  await page.goto(`${SITE}/rooms/${code}/games/${gameNumber}?replay&t=12&as=${otherId}`);
  await page.locator('[data-testid="replay-bar"][data-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForFunction(id => (document.querySelector('[data-testid="select-replay-as"]') as HTMLSelectElement | null)?.value === id, otherId, { timeout: 10_000 })
    .catch(async (e: Error) => { console.log("AS", otherId, await page.getByTestId("select-replay-as").inputValue(), "URL", page.url(), "TOASTS", await page.locator("[role=status], li[data-state]").allInnerTexts(), "CLOCK", await page.getByTestId("text-replay-clock").innerText()); throw e; });
  await page.getByTestId("text-replay-clock").getByText(/^0:1[2-9]/).waitFor({ timeout: 10_000 });
  await page.waitForURL(u => !new URL(u).searchParams.has("t"), { timeout: 10_000 });
  assert.deepEqual(phone.errors, [], "phone: no page errors");
  await phone.context.close();
} finally {
  await browser.close();
}
console.log("ok - an ended line game's replay steps, seeks to the end and matches the results at desktop and phone");
