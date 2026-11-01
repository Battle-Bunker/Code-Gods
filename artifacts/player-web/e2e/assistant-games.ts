/**
 * The assistant pane across games, in one page of the hosted player client (/client/ on the engine's site), never
 * reloaded: the assistant's context is per (player, game), so when the room's next game starts the pane must follow
 * the reactive game and show an empty, fresh assistant: no earlier transcript, no phase lines, no error, and sending
 * works at once.
 *
 *   pnpm --filter @workspace/player-web e2e:assistant
 *
 * Needs a running local engine (`pnpm --filter @workspace/engine dev`; the mock assistant provider). It uploads a
 * fresh build of the player client first (CG_E2E_SKIP_DEPLOY=1 skips that). What would break: a thread id held by the
 * client across games (the owner saw game 1's conversation in game 2 with "That conversation belongs to an earlier
 * game", until a reload).
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
  console.log("building and uploading the player client…");
  execFileSync("node", ["scripts/deploy-static.mjs", "--only", "player"], { cwd: ENGINE, stdio: "ignore", env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" } });
}

const { browserJwt, login } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const fn = { q: (n: string) => makeFunctionReference<"query">(n), m: (n: string) => makeFunctionReference<"mutation">(n), a: (n: string) => makeFunctionReference<"action">(n) };

const { session } = await login("bob");
const dana = new ConvexHttpClient(CLOUD);
dana.setAuth(await browserJwt(session));
const { roomId, shortCode } = await dana.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
const owner = (action: string, extra: Record<string, unknown> = {}) => dana.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
const revision = async () => (await dana.query(fn.q("rooms:get"), { room: roomId }) as { revision: number }).revision;
// A game needs three gods: dana and two (mock) AI seats.
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("settings", { revision: await revision(), settings: { objectType: "Int", typeArgs: { min: 0, max: 2147483647 }, languages: ["typescript"],
  startingObjectCount: 3, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9 } });
await dana.mutation(fn.m("rooms:approveAiBudget"), { roomId, aiBudget: 50_000, assistantBudget: 400_000 });
await owner("start");

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await context.addCookies(session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
const page = await context.newPage();
const pageErrors: string[] = [];
page.on("pageerror", e => pageErrors.push(e.message));
await page.goto(`${SITE}/client/rooms/${shortCode}`);
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
  await until(async () => /Game over/.test(await paneText()), "the pane notes the end");
  await owner("start");
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
