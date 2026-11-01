/**
 * Screenshots of the replay view (docs/replay-design.md; docs/screenshots/replay/) from a REAL game on the local
 * deployment (`pnpm --filter @workspace/engine dev`, then `pnpm --filter @workspace/engine deploy-static`): Bob owns a
 * room with two AI seats, summons two agents, the planning clock is cut short, the world runs for a while with chat,
 * the owner ends the game, and the hosted client opens its replay. It also checks the view's behaviour in a browser:
 * the deep link reopens the same event, stepping moves one event, an agent's code opens from the timeline, play moves
 * the playhead (and starts over from the end), other pages' links carry no replay position, and every player's goal
 * card is shown.
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

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const shoot = async (width: number, height: number, name: string, query: string, act?: (page: import("playwright").Page) => Promise<void>) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.addCookies(session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
  const page = await context.newPage();
  await page.goto(`${SITE}/client/rooms/${shortCode}/games/${gameCode}${query}`);
  await page.waitForSelector("[data-testid=replay]", { timeout: 60_000 });
  await page.waitForFunction(() => !document.querySelector("[data-testid=text-replay-event]")?.textContent?.includes("loading"), null, { timeout: 60_000 });
  if (act) await act(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  return { page, context };
};

const events = Number(await (async () => {
  const { page, context } = await shoot(1440, 900, "replay-end", "");
  const n = await page.getAttribute("[data-testid=replay]", "data-events");
  assert.equal(await page.getAttribute("[data-testid=replay]", "data-cursor"), n, "an ended game opens at its end");
  assert.ok((await page.locator("[data-testid^=replay-goal-]").count()) === 3, "every player's goal card");
  // Play at the end starts over.
  await page.selectOption("[data-testid=select-replay-speed]", "1");
  await page.click("[data-testid=button-replay-play]");
  await sleep(600);
  assert.ok(Number(await page.getAttribute("[data-testid=replay]", "data-cursor")) < Number(n), "play from the end restarts from the beginning");
  // Links to other pages do not carry the replay's position.
  assert.ok(!(await page.getAttribute("[data-testid=link-past-games]", "href"))?.includes("e="), "the past-games link carries no replay position");
  await context.close();
  return n;
})());
assert.ok(events > 20, `a real game's log (${events} events)`);
const mid = Math.floor(events * 0.6);
{
  const { page, context } = await shoot(1440, 900, "replay-mid", `?e=${mid}`);
  assert.equal(Number(await page.getAttribute("[data-testid=replay]", "data-cursor")), mid, "the deep link reopens the same event");
  await page.click("[data-testid=button-replay-next]");
  assert.equal(Number(await page.getAttribute("[data-testid=replay]", "data-cursor")), mid + 1, "next steps one event");
  await page.waitForFunction(() => location.search.includes("e="), null, { timeout: 5000 });
  assert.ok(new URL(page.url()).searchParams.get("e") === String(mid + 1), "the URL follows the playhead");
  const code = page.locator("[data-testid^=button-replay-agent-]").first();
  await code.click();
  await page.waitForSelector("[data-testid=text-replay-agent-source]");
  assert.match(await page.textContent("[data-testid=text-replay-agent-source]") ?? "", /slide/);
  await page.screenshot({ path: `${OUT}/replay-agent-code.png` });
  await page.click("[data-testid=button-replay-agent-close]");
  await page.click("[data-testid=button-replay-prev-moment]");
  await page.selectOption("[data-testid=select-replay-speed]", "64");
  const before = Number(await page.getAttribute("[data-testid=replay]", "data-cursor"));
  await page.click("[data-testid=button-replay-play]");
  await sleep(1500);
  assert.ok(Number(await page.getAttribute("[data-testid=replay]", "data-cursor")) > before, "playing moves the playhead");
  await context.close();
}
await shoot(390, 844, "replay-phone", `?e=${mid}`);
console.log(JSON.stringify({ out: OUT, room: shortCode, game: gameCode, events }));
await browser.close();
