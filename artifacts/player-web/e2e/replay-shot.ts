/**
 * Screenshots of the dock's replay mode (docs/replay-design.md §4; docs/screenshots/replay/) from a REAL game on the local
 * deployment (`pnpm --filter @workspace/engine dev`, then `pnpm --filter @workspace/engine deploy-static`): Bob owns a
 * room with two AI seats, summons two agents, the planning clock is cut short, the world runs for a while with chat,
 * the owner ends the game, and the hosted client opens its replay. It also checks the view's behaviour in a browser:
 * an ended game opens in the dock's replay mode at its end with the Timeline and the built-in panels; the deep link
 * reopens the same event; a step onto a change animates it on the board; the URL follows; an agent's code opens from
 * the timeline; the point of view switches; play moves the playhead (and starts over from the end); other pages'
 * links carry no replay position. First, as a player finds it: from the room page right after the game ends, with no
 * typed URL, "Watch the replay" opens the replay bar at the bottom of the screen; scrubbing to the middle, playing at
 * 4× and stepping each move the playhead, and the board changes with it.
 * Usage: node --experimental-transform-types e2e/replay-shot.ts <out-dir>
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const OUT = (process.argv[2] ?? ".").replace(/\/$/, "");
const CLOUD = process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
const SITE = process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";
const { browserJwt, login } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const fn = { q: (n: string) => makeFunctionReference<"query">(n), m: (n: string) => makeFunctionReference<"mutation">(n), a: (n: string) => makeFunctionReference<"action">(n) };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const config = JSON.parse(readFileSync(new URL("../../engine/.convex/local/default/config.json", import.meta.url), "utf8"));
const admin = new ConvexHttpClient(CLOUD);
(admin as unknown as { setAdminAuth(key: string): void }).setAdminAuth(config.adminKey);

const { session } = await login("bob");
const bob = new ConvexHttpClient(CLOUD);
bob.setAuth(await browserJwt(session));
const { roomId, shortCode } = await bob.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
const owner = (action: string, extra: Record<string, unknown> = {}) => bob.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
await admin.mutation(fn.m("aiTemplates:ensureSeeded"), {});
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await bob.mutation(fn.m("rooms:approveAiBudget"), { roomId, aiBudget: 20_000, assistantBudget: 200_000 });
await owner("start");
let gameId = "", gameCode = "", language = "python";
for (let i = 0; i < 180 && !gameId; i++, await sleep(1000)) {
  const o = await bob.query(fn.q("player:observation"), { roomId }) as { gameId?: string; gameShortCode?: string; language: string; phase: string };
  if (o.gameId) ({ gameId, gameShortCode: gameCode, language } = { gameId: o.gameId, gameShortCode: o.gameShortCode ?? "", language: o.language });
}
assert.ok(gameId, "the game started");
const submit = (command: Record<string, unknown>) => bob.action(fn.a("commands:submit"), { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), gameId, command } });
const source = (k: number) => language === "python" ? `def agent(grid):\n    return [slide(row(${k}), 1)]` : `function agent(grid) { return [slide(row(${k}), 1)]; }`;
for (const k of [0, 1]) { const r = await submit({ type: "summon", name: "Test agent", language, source: source(k) }) as { accepted: boolean; message: string }; assert.ok(r.accepted, r.message); }
await submit({ type: "chat", text: "I'll keep the top rows moving; leave them to me." });
await admin.mutation(fn.m("testing:patchGame"), { gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 5000 }, kick: true });
await sleep(14_000);
await submit({ type: "chat", text: "Row 1 is paying off nicely." });
await sleep(10_000);
await bob.mutation(fn.m("rooms:endActiveGame"), { roomId });
// A known starting layout (the arrangement follows a human between rooms, so another run's would carry over).
const { DEFAULT_LAYOUT } = await import("@workspace/player-client/layout");
await bob.mutation(fn.m("layout:set"), { roomId, layout: DEFAULT_LAYOUT("running") });

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const T = "[data-testid=replay-transport]";
const cursorOf = async (page: import("playwright").Page) => Number(await page.getAttribute(T, "data-cursor"));
const open = async (width: number, height: number, query: string) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.addCookies(session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
  const page = await context.newPage();
  await page.goto(`${SITE}/client/rooms/${shortCode}/games/${gameCode}${query}`);
  await page.waitForSelector(T, { timeout: 60_000 });
  await page.waitForSelector("[data-testid=panel-timeline]", { timeout: 30_000 });
  return { page, context };
};

const boardText = (page: import("playwright").Page) => page.locator("[data-testid^=row-object-]").allTextContents().then(t => t.join("|"));
{
  // The owner's journey: the room page right after "Game over". No URL is typed: the bar under the dock offers the replay.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addCookies(session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
  const page = await context.newPage();
  await page.goto(`${SITE}/client/rooms/${shortCode}`);
  await page.waitForSelector("[data-testid=ended-game-bar]", { timeout: 60_000 });
  await page.waitForSelector(".cg-pane-header", { timeout: 30_000 });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/replay-room-ended.png` });
  await page.click("[data-testid=link-watch-replay]");
  await page.waitForSelector(T, { timeout: 60_000 });
  assert.equal(new URL(page.url()).pathname, `/client/rooms/${shortCode}/games/${gameCode}`, "the replay is the game's page");
  // One bar, anchored to the bottom of the screen, with a track wider than half the screen.
  const bar = (await page.locator(T).boundingBox())!;
  assert.ok(Math.abs(bar.y + bar.height - 900) <= 2, `the replay bar sits at the bottom (${bar.y}+${bar.height})`);
  const track = (await page.locator("[data-testid=input-replay-scrub]").boundingBox())!;
  assert.ok(track.width > 720, `the scrub track is wide (${track.width})`);
  const total = Number(await page.getAttribute(T, "data-events"));
  assert.equal(await cursorOf(page), total, "it opens at the end");
  assert.ok(await page.locator("[data-testid=replay-marker]").count() > 0, "key moments are marked on the track");
  // Scrub to the middle: hover names the moment, a click seeks there, and the board shows the game at that moment.
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
  await page.waitForSelector("[data-testid=replay-scrub-tooltip]");
  assert.match(await page.textContent("[data-testid=replay-scrub-tooltip]") ?? "", /\d+:\d\d · event \d+/);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.45, track.y + track.height / 2, { steps: 4 });
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2, { steps: 4 });
  await page.mouse.up();
  const middle = await cursorOf(page);
  assert.ok(Math.abs(middle - total / 2) <= Math.max(2, total * 0.02), `dragging to the middle seeks there (${middle} of ${total})`);
  await page.waitForSelector("[data-testid^=row-object-]", { timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/replay-bar-middle.png` });
  const atMiddle = await boardText(page);
  // Play at 4×: the playhead moves on and the board with it.
  await page.selectOption("[data-testid=select-replay-speed]", "4");
  await page.click("[data-testid=button-replay-play]");
  await page.waitForFunction(m => Number(document.querySelector("[data-testid=replay-transport]")?.getAttribute("data-cursor")) > m + 3, middle, { timeout: 15_000 });
  await page.click("[data-testid=button-replay-play]");
  assert.equal(await page.getAttribute(T, "data-playing"), "0", "pause stops playback");
  const played = await cursorOf(page);
  await page.waitForFunction(b => [...document.querySelectorAll("[data-testid^=row-object-]")].map(e => e.textContent).join("|") !== b, atMiddle, { timeout: 5_000 });
  // Step forward and back by one event; the keys step too.
  await page.click("[data-testid=button-replay-next]");
  assert.equal(await cursorOf(page), played + 1, "step forward moves one event");
  await page.click("[data-testid=button-replay-prev]");
  await page.click("[data-testid=button-replay-prev]");
  assert.equal(await cursorOf(page), played - 1, "step back moves one event");
  await page.locator("body").press("ArrowRight");
  assert.equal(await cursorOf(page), played, "→ steps forward");
  await page.locator("body").press("Home");
  assert.equal(await cursorOf(page), 0, "Home jumps to the start");
  await page.click("[data-testid=button-replay-end]");
  assert.equal(await cursorOf(page), total, "the end button jumps to the end");
  // The palette drives the replay too: jump to the start, then play.
  const palette = async (id: string) => {
    await page.keyboard.press("Control+k");
    await page.waitForSelector("[data-testid=dialog-palette]");
    await page.click(`[data-testid="row-palette-${id}"]`);
    await page.waitForSelector("[data-testid=dialog-palette]", { state: "detached", timeout: 10_000 });
  };
  await palette("ui.replay.start");
  assert.equal(await cursorOf(page), 0, "the palette's Replay: jump to the start");
  await palette("ui.replay.toggle");
  await page.waitForFunction(() => Number(document.querySelector("[data-testid=replay-transport]")?.getAttribute("data-cursor")) > 0, null, { timeout: 15_000 });
  assert.equal(await page.getAttribute(T, "data-playing"), "1", "the palette's Play the replay plays it");
  // Back in the room, the palette offers the replay as well.
  await page.goto(`${SITE}/client/rooms/${shortCode}`);
  await page.waitForSelector("[data-testid=ended-game-bar]", { timeout: 60_000 });
  await palette("ui.replay.watch");
  await page.waitForSelector(T, { timeout: 60_000 });
  assert.equal(new URL(page.url()).pathname, `/client/rooms/${shortCode}/games/${gameCode}`, "the palette's Watch the replay opens it");
  // The engine UI's page of the ended game leads with the replay.
  await page.goto(`${SITE}/rooms/${shortCode}/games/${gameCode}`);
  await page.waitForSelector("[data-testid=link-watch-replay]", { timeout: 60_000 });
  assert.equal(new URL(await page.getAttribute("[data-testid=link-watch-replay]", "href") ?? "", SITE).pathname, `/client/rooms/${shortCode}/games/${gameCode}`);
  await page.screenshot({ path: `${OUT}/replay-engine-game-page.png` });
  await context.close();
}

let events = 0;
{
  // An ended game opens in the dock's replay mode at its end, with the Timeline and the built-in panels showing it.
  const { page, context } = await open(1440, 900, "");
  events = Number(await page.getAttribute(T, "data-events"));
  assert.ok(events > 20, `a real game's log (${events} events)`);
  assert.equal(await cursorOf(page), events, "an ended game opens at its end");
  assert.ok((await page.locator("[data-testid^=replay-standing-]").count()) === 3, "every player in the standings");
  // At the end the first pane follows the phase to the results, as in a live game that ends.
  await page.waitForFunction(() => document.querySelector("[data-testid=dock]")?.textContent?.includes("Final standings"), null, { timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/replay-dock-end.png` });
  // Play at the end starts over; links elsewhere carry no replay position.
  await page.selectOption("[data-testid=select-replay-speed]", "1");
  await page.click("[data-testid=button-replay-play]");
  await sleep(600);
  assert.ok(await cursorOf(page) < events, "play from the end restarts from the beginning");
  assert.ok(!(await page.getAttribute("[data-testid=link-past-games]", "href"))?.includes("e="), "the past-games link carries no replay position");
  await context.close();
}
const mid = Math.floor(events * 0.6);
{
  const { page, context } = await open(1440, 900, `?e=${mid}`);
  assert.equal(await cursorOf(page), mid, "the deep link reopens the same event");
  // Mid-game the first pane follows the phase to the objects, drawn from the replay at the playhead.
  await page.waitForSelector("[data-testid^=row-object-]", { timeout: 15_000 });
  // Step until a change animates on the board (a transformation among the next events).
  let animated = false;
  for (let i = 0; i < 30 && !animated; i++) {
    await page.click("[data-testid=button-replay-next]");
    animated = await page.locator("[data-testid^=row-object-].replay-changed").count() > 0;
  }
  assert.ok(animated, "a step onto a change animates its object on the board");
  assert.ok(await cursorOf(page) > mid, "next steps forward");
  await page.screenshot({ path: `${OUT}/replay-dock-step.png` });
  await page.waitForFunction(() => new URL(location.href).searchParams.has("e"), null, { timeout: 5000 });
  assert.equal(new URL(page.url()).searchParams.get("e"), String(await cursorOf(page)), "the URL follows the playhead");
  await page.locator("[data-testid^=button-replay-agent-]").first().click();
  await page.waitForSelector("[data-testid=text-replay-agent-source]");
  assert.match(await page.textContent("[data-testid=text-replay-agent-source]") ?? "", /slide/);
  await page.screenshot({ path: `${OUT}/replay-agent-code.png` });
  await page.click("[data-testid=button-replay-agent-close]");
  // The assistant receives the playhead: a message sent from the replay briefs it with the game and the moment on screen.
  const at = await cursorOf(page);
  await page.fill("[data-testid=input-assistant]", `/mock ${JSON.stringify({ steps: [{ echo: true }] })}`);
  await page.press("[data-testid=input-assistant]", "Enter");
  const briefing = await (async () => {
    for (let i = 0; i < 60; i++, await sleep(500)) {
      const threads = await bob.query(fn.q("assistant:threads"), { roomId }) as { _id: string }[];
      for (const t of threads) {
        const thread = await bob.query(fn.q("assistant:thread"), { threadId: t._id }) as { messages: { role: string; text: string }[] };
        const reply = thread.messages.find(m => m.role === "assistant" && m.text.includes("<replay>"));
        if (reply) return (JSON.parse(reply.text).context as string[])[0];
      }
    }
    return "";
  })();
  assert.ok(briefing.includes(`game ${gameCode}`) && briefing.includes(`at event ${at} of ${events}`), `the assistant was briefed with the playhead: ${briefing.slice(-400)}`);
  // Another player's point of view: the transport switches every panel to theirs.
  await page.selectOption("[data-testid=select-replay-pov]", "1");
  assert.equal(await page.getAttribute(T, "data-pov"), "1");
  await page.selectOption("[data-testid=select-replay-speed]", "64");
  const before = await cursorOf(page);
  await page.click("[data-testid=button-replay-play]");
  await sleep(1500);
  assert.ok(await cursorOf(page) > before, "playing moves the playhead");
  await context.close();
}
{
  const { page, context } = await open(390, 844, `?e=${mid}`);
  // On a phone the bar stays at the bottom, above the assistant's sheet.
  const bar = (await page.locator(T).boundingBox())!;
  assert.ok(Math.abs(bar.y + bar.height - 844) <= 2, `the phone's replay bar sits at the bottom (${bar.y}+${bar.height})`);
  const sheet = await page.locator(".cg-sheet").boundingBox();
  assert.ok(!sheet || sheet.y + sheet.height <= bar.y + 1, "the assistant's sheet sits above the bar");
  const play = (await page.locator("[data-testid=button-replay-play]").boundingBox())!;
  assert.equal(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid=button-replay-play]") !== null, [play.x + play.width / 2, play.y + play.height / 2]), true, "play is not covered");
  await page.screenshot({ path: `${OUT}/replay-phone.png` });
  await context.close();
}
console.log(JSON.stringify({ out: OUT, room: shortCode, game: gameCode, events }));
await browser.close();
