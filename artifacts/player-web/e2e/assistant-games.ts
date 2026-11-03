/**
 * The assistant pane across games, in one page of the app on the engine's site (signed in with the site's session),
 * never reloaded: the assistant's context is per (player, game). Game 1 is played at its page
 * (/rooms/:room/games/:game); when it ends that page is its replay, the player goes back to the room page in the app,
 * and when the room's next game starts the room page takes them to game 2's page, whose pane must show an empty,
 * fresh assistant: no earlier transcript, no phase lines, no error, and sending works at once.
 *
 *   pnpm --filter @workspace/player-web e2e:assistant
 *
 * Needs a running local engine (`pnpm --filter @workspace/engine dev`; the mock assistant provider). It uploads a
 * fresh build of the app first (CG_E2E_SKIP_DEPLOY=1 skips that). What would break: a thread id held by the client
 * across games (the owner saw game 1's conversation in game 2 with "That conversation belongs to an earlier game",
 * until a reload).
 */
import "../../engine/scripts/local-only.mjs";   // refuses to run with CONVEX_DEPLOY_KEY set
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ENGINE = join(ROOT, "artifacts/engine");
const CLOUD = process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
const SITE = process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function check(name: string, run: () => Promise<unknown> | unknown) {
  try { await run(); results.push({ name, ok: true }); console.log(`ok   ${name}`); }
  catch (error) { const detail = (error as Error).message.split("\n")[0]; results.push({ name, ok: false, detail }); console.log(`FAIL ${name}: ${detail}`); }
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until<T>(read: () => Promise<T | undefined | null | false>, label: string, ms = 60_000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) { const value = await read(); if (value) return value; }
  throw new Error(`timed out: ${label}`);
}

if (!(await fetch(`${SITE}/api/health`).then(r => r.ok, () => false))) {
  console.error(`No engine at ${SITE}. Start one: pnpm --filter @workspace/engine dev`);
  process.exit(1);
}
if (process.env.CG_E2E_SKIP_DEPLOY !== "1") {
  console.log("building and uploading the app…");
  execFileSync("node", ["scripts/deploy-static.mjs"], { cwd: ENGINE, stdio: "ignore", env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" } });
}

const { browserJwt, login } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const fn = { q: (n: string) => makeFunctionReference<"query">(n), m: (n: string) => makeFunctionReference<"mutation">(n), a: (n: string) => makeFunctionReference<"action">(n) };

const { session } = await login("bob");
const dana = new ConvexHttpClient(CLOUD);
dana.setAuth(await browserJwt(session));
const { roomId, shortCode } = await dana.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
await dana.mutation(fn.m("rooms:setSpectator"), { roomId: roomId, spectator: false });   // owners start as spectators; this one plays
const owner = (action: string, extra: Record<string, unknown> = {}) => dana.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
const revision = async () => (await dana.query(fn.q("rooms:get"), { room: roomId }) as { revision: number }).revision;
// A game needs three gods: dana and two (mock) AI seats.
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("settings", { revision: await revision(), settings: { objectType: "Int", typeArgs: { min: 0, max: 2147483647 }, languages: ["typescript"],
  startingObjectCount: 3, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9 } });
await dana.mutation(fn.m("rooms:approveAiBudget"), { roomId, aiBudget: 50_000, assistantBudget: 400_000 });
/** Start the room's next game and wait until it is live (a start may first prepare rule tables); its short code. */
async function startGame() {
  await owner("start");
  for (const end = Date.now() + 300_000; Date.now() < end; await sleep(500)) {
    const code = (await dana.query(fn.q("rooms:get"), { room: roomId }) as { activeGame: { shortCode: string } | null }).activeGame?.shortCode;
    if (code) return code;
  }
  throw new Error("timed out: the game starts");
}
const game1 = await startGame();

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await context.addCookies(session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
const page = await context.newPage();
const pageErrors: string[] = [];
page.on("pageerror", e => pageErrors.push(e.message));
await page.goto(`${SITE}/rooms/${shortCode}/games/${game1}`);
await page.waitForSelector("[data-testid=input-assistant]", { timeout: 60_000 });
// A reload would drop this marker (a same-document URL change would not).
await page.evaluate(() => { (window as unknown as { __cgMarker: number }).__cgMarker = 42; });
const sameDocument = () => page.evaluate(() => (window as unknown as { __cgMarker?: number }).__cgMarker === 42);

const pane = "[data-testid=assistant-pane]";
const paneText = () => page.textContent(pane).then(t => t ?? "");
async function say(text: string) {
  await page.fill("[data-testid=input-assistant]", `/mock ${JSON.stringify({ steps: [{ text }] })}`);
  await page.click("[data-testid=button-assistant-send]");
  await until(async () => (await page.locator(`${pane} [data-testid=assistant-message]`, { hasText: text }).count()) > 0, `the answer "${text}"`)
    .catch(async error => { await page.screenshot({ path: join(process.env.CG_E2E_SHOTS ?? "/tmp", "assistant-games.png") }); throw new Error(`${(error as Error).message}; the pane shows ${JSON.stringify((await paneText()).slice(0, 300))}`); });
}

await check("game 1: a conversation in the pane", async () => {
  await say("answer of game one");
  await say("second answer of game one");
});

await check("game 2 starts in the same page: the pane shows an empty, fresh assistant without a reload", async () => {
  await owner("endGame");
  // An ended game's page is its replay; its header leads back to the room, which opens the next game when it starts.
  await page.waitForSelector("[data-testid=replay-transport]", { timeout: 60_000 });
  await page.click("[data-testid=link-past-games]");
  await page.waitForURL(url => url.pathname === `/rooms/${shortCode}`, { timeout: 30_000 });
  await page.waitForSelector("[data-testid=text-room-code]", { timeout: 30_000 });
  const game2 = await startGame();
  await page.waitForURL(url => url.pathname === `/rooms/${shortCode}/games/${game2}`, { timeout: 30_000 });
  await page.waitForSelector(pane, { timeout: 60_000 });
  await until(async () => {
    const text = await paneText();
    return !text.includes("answer of game one") && (await page.locator(`${pane} [data-testid=assistant-user-message]`).count()) === 0;
  }, "game 1's transcript leaves the pane", 30_000);
  const text = await paneText();
  assert(!/Game over|The world is running/.test(text), `phase lines of the last game stay: ${text.slice(0, 200)}`);
  assert((await page.locator(`${pane} [data-testid=text-assistant-error]`).count()) === 0, "an error is shown");
  assert(await sameDocument(), "the page reloaded");
});

await check("game 2: the first message is answered in a new conversation, with nothing of game 1", async () => {
  await say("answer of game two");
  const text = await paneText();
  assert(!text.includes("answer of game one"), "game 1's transcript is back");
  assert((await page.locator(`${pane} [data-testid=text-assistant-error]`).count()) === 0, `an error: ${await page.textContent(`${pane} [data-testid=text-assistant-error]`).catch(() => "")}`);
  assert((await page.locator(`${pane} [data-testid=assistant-user-message]`).count()) === 1, "one message in game 2's transcript");
  assert(await sameDocument(), "the page reloaded");
});

await check("no uncaught page errors", () => assert(pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ")));

await owner("endGame").catch(() => {});
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
