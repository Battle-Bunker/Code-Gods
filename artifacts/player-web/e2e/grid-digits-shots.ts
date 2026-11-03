/**
 * Screenshots of Grid digits as the app draws them, one game per colour set (rgb, rgby, rainbow6) and a 7×7 card
 * game, on the live game's page (/rooms/:room/games/:game) in both of its views: the player view (Alice's dock: she
 * plays) and the spectator view (Bob, a member who watches), for checking the digit palettes by eye (DIGIT_SHADES).
 * Each shot is cropped to the first panel that shows digits, at 1× (a real monitor's pixels).
 *
 * Usage (local engine running, the app deployed with deploy-static.mjs):
 *   node --experimental-transform-types e2e/grid-digits-shots.ts <out dir> [label]
 */
import "../../engine/scripts/local-only.mjs";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] ?? ".", LABEL = process.argv[3] ?? "shot";
const CLOUD = process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
const SITE = process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";
const { browserJwt, login } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const fn = { q: (n: string) => makeFunctionReference<"query">(n), m: (n: string) => makeFunctionReference<"mutation">(n), a: (n: string) => makeFunctionReference<"action">(n) };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const { session } = await login("admin");
const me = new ConvexHttpClient(CLOUD);
me.setAuth(await browserJwt(session));
// Bob joins each room as a spectator: his page of the game is the spectator view.
const { session: watcher } = await login("bob");
const bob = new ConvexHttpClient(CLOUD);
bob.setAuth(await browserJwt(watcher));
// The colour sets at their seed setups' sizes, and the widest grid: 7×7 playing cards.
const SETS = [["rgb", 5, "base10"], ["rgby", 5, "base10"], ["rainbow6", 6, "base10"], ["rainbow6", 7, "cards"]] as const;
const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const cookiesOf = (header: string) => header.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE }));

async function shoot(app: "player" | "spectator", set: string, gamePath: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addCookies(cookiesOf(app === "player" ? session : watcher));
  const page = await context.newPage();
  await page.goto(`${SITE}${gamePath}`);
  const digits = page.locator("[data-renderer=digits]");
  try { await digits.first().waitFor({ timeout: 60_000 }); } catch { console.log(`${app} ${set}: no digits shown`); await page.screenshot({ path: `${OUT}/${LABEL}-${app}-${set}-page.png` }); await context.close(); return; }
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.fonts.ready);
  // Crop to the column of digit grids: from the first to the last one in view, with some margin.
  const boxes = (await digits.evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })))
    .filter(b => b.w > 0 && b.y < 900);
  if (!boxes.length) { console.log(`${app} ${set}: no digits in view`); await page.screenshot({ path: `${OUT}/${LABEL}-${app}-${set}-page.png` }); await context.close(); return; }
  const x0 = Math.max(0, Math.min(...boxes.map(b => b.x)) - 160), y0 = Math.max(0, Math.min(...boxes.map(b => b.y)) - 40);
  const x1 = Math.min(1440, Math.max(...boxes.map(b => b.x + b.w)) + 160), y1 = Math.min(900, Math.max(...boxes.map(b => b.y + b.h)) + 20);
  await page.screenshot({ path: `${OUT}/${LABEL}-${app}-${set}.png`, clip: { x: x0, y: y0, width: x1 - x0, height: Math.min(y1 - y0, 620) } });
  console.log(`${app} ${set}: ${boxes.length} grids, widest ${Math.max(...boxes.map(b => b.w)).toFixed(0)} px`);
  await context.close();
}

// One game at a time, shot in both views while it runs.
for (const [colours, size, symbols] of SETS) {
  const { roomId, shortCode } = await me.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
  await me.mutation(fn.m("rooms:setSpectator"), { roomId: roomId, spectator: false });   // owners start as spectators; this one plays
  await bob.mutation(fn.m("rooms:join"), { room: roomId, spectator: true });
  const room = await me.query(fn.q("rooms:get"), { room: roomId }) as { revision: number; settings: Record<string, unknown> };
  await me.action(fn.a("owner:settings"), { roomId, revision: room.revision, settings: { ...room.settings, typeArgs: { size, symbols, colours } } });
  const owner = (action: string, extra: Record<string, unknown> = {}) => me.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
  await owner("addAi", { aiAgentId: "sonnet-strategist" });
  await owner("addAi", { aiAgentId: "sonnet-strategist" });
  await me.mutation(fn.m("rooms:setAiQuotas"), { roomId, aiQuota: 50_000, assistantQuota: 200_000 });
  await owner("start");
  for (let i = 0; ; i++) {
    const o = await me.query(fn.q("player:observation"), { roomId }) as { phase: string; objects: unknown[] };
    if (o.phase === "running" && o.objects.length >= 5) break;
    if (i >= 120) throw new Error(`${colours}: the game is ${o.phase} with ${o.objects.length} objects after 120 s`);
    await sleep(1000);
  }
  const set = symbols === "cards" ? `${colours}-cards` : colours;
  const game = (await me.query(fn.q("rooms:get"), { room: roomId }) as { activeGame: { shortCode: string } | null }).activeGame!.shortCode;
  for (const app of ["player", "spectator"] as const) await shoot(app, set, `/rooms/${shortCode}/games/${game}`);
  await owner("endGame");
}
await browser.close();
