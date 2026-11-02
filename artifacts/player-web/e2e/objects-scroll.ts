/**
 * Browser check of "Objects by payoff" infinite scroll on a REAL local game (docs/panels.md): the first screen holds
 * one page, scrolling to the end loads more rows (the footer's "N of M" grows), the sort selector reorders the whole
 * collection (and persists as the pane's `sortBy`), and a reload keeps the sort. Screenshots and a video go to <out-dir>.
 *   pnpm --filter @workspace/engine dev ; pnpm --filter @workspace/engine deploy-static
 *   cd artifacts/player-web && node --experimental-transform-types e2e/objects-scroll.ts <out-dir>
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const OUT = (process.argv[2] ?? "objects-scroll").replace(/\/$/, "");
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

const { session } = await login("bob");
const bob = new ConvexHttpClient(CLOUD);
bob.setAuth(await browserJwt(session));
const { roomId, shortCode } = await bob.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
await bob.mutation(fn.m("rooms:setSpectator"), { roomId: roomId, spectator: false });   // owners start as spectators; this one plays
const owner = (action: string, extra: Record<string, unknown> = {}) => bob.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
await admin.mutation(fn.m("aiTemplates:ensureSeeded"), {});
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
const room = await bob.query(fn.q("rooms:get"), { room: roomId }) as { revision: number };
await owner("settings", { revision: room.revision, settings: { startingObjectCount: 40, planningSeconds: 600, halfLifeSeconds: 3600 } });
await bob.mutation(fn.m("rooms:approveAiBudget"), { roomId, aiBudget: 20_000, assistantBudget: 0 });
await owner("start");
let gameId = "", gameCode = "";
for (let i = 0; i < 180 && !gameId; i++, await sleep(1000)) {
  const o = await bob.query(fn.q("player:observation"), { roomId }) as { gameId?: string; gameShortCode?: string };
  if (o.gameId) ({ gameId, gameShortCode: gameCode } = { gameId: o.gameId, gameShortCode: o.gameShortCode ?? "" });
}
assert.ok(gameId, "the game started");
await admin.mutation(fn.m("testing:patchGame"), { gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 100_000 }, kick: true });
await sleep(3000);

const tabs = (id: string) => ({ type: "tabs", panes: [id], active: id });
await bob.mutation(fn.m("layout:set"), { roomId, layout: { version: 1, root: tabs("p1"), panes: { p1: { id: "p1", kind: "panel", panelId: "objects", params: { limit: 12 }, setBy: "human" } } } });

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 900, height: 700 }, recordVideo: { dir: OUT, size: { width: 900, height: 700 } } });
await context.addCookies(session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
const page = await context.newPage();
await page.goto(`${SITE}/client/rooms/${shortCode}/games/${gameCode}`);
const rows = page.locator("[data-testid^=row-object-]");
await rows.first().waitFor({ timeout: 60_000 });
const footer = () => page.locator("[data-testid=text-objects-footer]").innerText();
const counts = async () => (await footer()).match(/^(\d+) of (\d+)/)!.slice(1).map(Number);

await sleep(1500);
const [first, total] = await counts();
assert.equal(first, 12, "one page at first");
assert.ok(total > 12, `the world holds more than a page (${total})`);
await page.screenshot({ path: `${OUT}/before-scroll.png` });

// Scrolling to the end of the list loads the next page, by itself.
const loadedNow = () => page.locator("[data-testid=text-objects-footer]").innerText().then(t => Number(t.match(/^(\d+) of/)![1]));
await page.locator("[data-testid=text-objects-footer]").scrollIntoViewIfNeeded();
await page.mouse.wheel(0, 4000);
await page.waitForFunction(n => Number(document.querySelector("[data-testid=text-objects-footer]")?.textContent?.match(/^(\d+) of/)?.[1]) > n, first, { timeout: 20_000 });
const loaded = await loadedNow();
assert.ok(loaded > first, `scrolling loaded more rows (${first} → ${loaded})`);
assert.equal(await rows.count(), loaded, "every counted row is on the page");
await page.screenshot({ path: `${OUT}/after-scroll.png` });
console.log(JSON.stringify({ first, loaded, total }));

// Sort selector: "Your bits" orders the whole collection by the viewer's own bits and persists.
const bits = async () => rows.evaluateAll(els => els.map(el => Number((el.querySelector("[data-testid^=payoff-rect-]") as SVGElement | null)?.getAttribute("aria-label")?.match(/your bits (-?[\d.]+)/)?.[1] ?? NaN)));
await page.click("[data-testid=sort-mine]");
await page.waitForFunction(() => document.querySelector("[data-testid=sort-mine]")?.getAttribute("aria-checked") === "true");
await sleep(1500);
const mine = (await bits()).slice(0, 12);
assert.ok(mine.every((n, i) => i === 0 || mine[i - 1] >= n - 1e-9), `rows are in descending order of your bits: ${mine.join(", ")}`);
assert.equal((await counts())[0], 12, "a new sort starts from the first page");
await page.screenshot({ path: `${OUT}/sorted-mine.png` });
await page.click("[data-testid=sort-othersCare]");
await sleep(1500);
await page.screenshot({ path: `${OUT}/sorted-others.png` });
await page.reload();
await rows.first().waitFor({ timeout: 60_000 });
assert.equal(await page.getAttribute("[data-testid=sort-othersCare]", "aria-checked"), "true", "the sort survives a reload (the pane's parameter)");
await context.close();
await browser.close();
console.log("ok");
