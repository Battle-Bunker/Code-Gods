/**
 * Screenshots of the dock's replay mode (docs/replay-design.md §4; docs/screenshots/replay/) from a REAL game on the local
 * deployment (`pnpm --filter @workspace/engine dev`, then `pnpm --filter @workspace/engine deploy-static`): Bob owns a
 * room with two AI seats, summons two agents, the planning clock is cut short, the world runs for a while with chat,
 * the owner ends the game, and the hosted client opens its replay. It also checks the view's behaviour in a browser:
 * an ended game opens in the dock's replay mode at its end with the Timeline and the built-in panels; the deep link
 * reopens the same event; a step onto a change animates it on the board; the URL follows; an agent's code opens from
 * the timeline; the point of view switches; play moves the playhead (and starts over from the end); other pages'
 * links carry no replay position.
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
await bob.mutation(fn.m("rooms:approveAiBudget"), { roomId, aiBudget: 20_000 });
await owner("start");
let gameId = "", gameCode = "", language = "python";
for (let i = 0; i < 180 && !gameId; i++, await sleep(1000)) {
  const o = await bob.query(fn.q("player:observation"), { roomId }) as { gameId?: string; gameShortCode?: string; language: string; phase: string };
  if (o.gameId) ({ gameId, gameShortCode: gameCode, language } = { gameId: o.gameId, gameShortCode: o.gameShortCode ?? "", language: o.language });
}
assert.ok(gameId, "the game started");
const submit = (command: Record<string, unknown>) => bob.action(fn.a("commands:submit"), { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), gameId, command } });
const source = (k: number) => language === "python" ? `def agent(grid):\n    return [slide(row(${k}), 1)]` : `function agent(grid) { return [slide(row(${k}), 1)]; }`;
for (const k of [0, 1]) { const r = await submit({ type: "summon", language, source: source(k) }) as { accepted: boolean; message: string }; assert.ok(r.accepted, r.message); }
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
  await page.screenshot({ path: `${OUT}/replay-phone.png` });
  await context.close();
}
console.log(JSON.stringify({ out: OUT, room: shortCode, game: gameCode, events }));
await browser.close();
