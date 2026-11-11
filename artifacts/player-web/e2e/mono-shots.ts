/**
 * Screenshots of a real game on the default setup (Annotated basics: the numbers-only 4×4 board, Grid(4,base10,mono)):
 * the board and goal card in both schemes, a grid's detail and the tiles renderer, a phone, a spectator, the rule
 * gallery and the replay. Same setup as readme-shots.ts (engine dev, then deploy-static):
 *   cd artifacts/player-web && node --experimental-transform-types e2e/mono-shots.ts <out-dir>
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const OUT = (process.argv[2] ?? "readme-shots").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });
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

// ---- a real game on the default setup (Annotated basics: Grid(4,base10,mono)) -----------------------------------
const as = async (who: string) => { const { session } = await login(who); const c = new ConvexHttpClient(CLOUD); c.setAuth(await browserJwt(session)); return { c, session }; };
const bob = await as("admin"), carol = await as("carol");
const { roomId, shortCode } = await bob.c.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
await bob.c.mutation(fn.m("rooms:setSpectator"), { roomId, spectator: false });
await carol.c.mutation(fn.m("rooms:join"), { room: roomId });
await carol.c.mutation(fn.m("rooms:setSpectator"), { roomId, spectator: true }).catch(() => undefined);
const owner = (action: string, extra: Record<string, unknown> = {}) => bob.c.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
await admin.mutation(fn.m("aiTemplates:ensureSeeded"), {});
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
const room = await bob.c.query(fn.q("rooms:get"), { room: roomId }) as { revision: number; settings?: { typeArgs?: unknown } };
console.log("room settings typeArgs", JSON.stringify(room.settings?.typeArgs));
await owner("settings", { revision: room.revision, settings: { planningSeconds: 30 } });
await bob.c.mutation(fn.m("rooms:setAiQuotas"), { roomId, aiQuota: 400_000, assistantQuota: 200_000 });
await owner("start");
let gameId = "", gameCode = "";
for (let i = 0; i < 180 && !gameId; i++, await sleep(1000)) {
  const o = await bob.c.query(fn.q("player:observation"), { roomId }) as { gameId?: string; gameShortCode?: string };
  if (o.gameId) ({ gameId, gameShortCode: gameCode } = { gameId: o.gameId, gameShortCode: o.gameShortCode ?? "" });
}
assert.ok(gameId, "the game started");
const submit = (command: Record<string, unknown>) => bob.c.action(fn.a("commands:submit"), { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), gameId, command } });
for (let i = 0; i < 60; i++, await sleep(2000)) {
  const r = await submit({ type: "summon", name: "Writer", language: "python", source: "def agent(grid):\n    c = grid.cell(0, 0)\n    return [write(c, (c.value + 1) % 10)]" }) as { accepted: boolean; message: string };
  if (r.accepted) break;
  if (!/warm|ready/i.test(r.message)) throw new Error(r.message);
}
await admin.mutation(fn.m("testing:patchGame"), { gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 100_000 }, kick: true });
await sleep(25_000);

type Layout = Record<string, unknown>;
const tabs = (id: string) => ({ type: "pane", id });
const panel = (id: string, panelId: string) => ({ id, kind: "panel", panelId, params: {}, setBy: "human" });
const setLayout = (layout: Layout) => bob.c.mutation(fn.m("layout:set"), { roomId, layout });
const beside = (a: string, b: string): Layout => ({ version: 1, root: { type: "split", direction: "row", sizes: [50, 50], children: [tabs("p1"), tabs("p2")] },
  panes: { p1: panel("p1", a), p2: panel("p2", b) } });

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const url = `${SITE}/rooms/${shortCode}/games/${gameCode}`;
const open = async (who: typeof bob, scheme: "light" | "dark", viewport = { width: 1280, height: 800 }) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: scheme });
  await context.addCookies(who.session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
  return context.newPage();
};
for (const scheme of ["light", "dark"] as const) {
  const page = await open(bob, scheme);
  await setLayout(beside("objects", "my-card"));
  await page.goto(url);
  await page.waitForSelector("[data-testid=goal-example-board], [data-testid=grid-object]", { timeout: 60_000 });
  await sleep(4000);
  await page.screenshot({ path: `${OUT}/game-${scheme}.png` });
  // Tiles renderer, and a grid's detail popover.
  await page.locator("[data-testid=grid-object]").first().click();
  await sleep(800);
  await page.screenshot({ path: `${OUT}/detail-${scheme}.png` });
  await page.click("[data-testid=button-grid-renderer-tiles]").catch(() => undefined);
  await page.keyboard.press("Escape");
  await sleep(800);
  await page.screenshot({ path: `${OUT}/tiles-${scheme}.png` });
  await page.click("[data-testid=button-grid-renderer-tiles]").catch(() => undefined);
  const text = await page.textContent("body") ?? "";
  console.log(scheme, "body mentions plain:", /\bplain\b/i.test(text), "Colour cue:", /Colour cue/.test(text));
  await page.close();
}
const phone = await open(bob, "light", { width: 390, height: 844 });
await setLayout(beside("objects", "my-card"));
await phone.goto(url);
await sleep(6000);
await phone.screenshot({ path: `${OUT}/game-phone.png` });
await phone.close();
// The spectator's view.
const spec = await open(carol, "light");
await spec.goto(url);
await sleep(8000);
await spec.screenshot({ path: `${OUT}/spectator.png` });
await spec.close();
// The rule gallery on the numbers-only board.
const gal = await open(bob, "light");
await gal.goto(`${SITE}/rule-gallery/number_bonds?size=4&symbols=base10&colours=mono`);
await sleep(5000);
await gal.screenshot({ path: `${OUT}/gallery-number-bonds.png`, fullPage: true });
await gal.goto(`${SITE}/rule-gallery/kingdom?size=4&symbols=base10&colours=mono`);
await sleep(4000);
await gal.screenshot({ path: `${OUT}/gallery-kingdom-locked.png`, fullPage: true });
await gal.close();
// The replay.
await bob.c.mutation(fn.m("rooms:endActiveGame"), { roomId });
const rep = await open(bob, "light");
await rep.goto(url);
await rep.waitForSelector("[data-testid=replay-transport]", { timeout: 60_000 });
await sleep(4000);
await rep.screenshot({ path: `${OUT}/replay.png` });
await browser.close();
console.log(JSON.stringify({ out: OUT, room: shortCode, game: gameCode }));
