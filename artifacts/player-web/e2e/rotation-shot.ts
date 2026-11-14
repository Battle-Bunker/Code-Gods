/**
 * The rotated deal and the practice partner in a browser (docs/beginner-pool.md §6, §7), on the local deployment
 * (`pnpm --filter @workspace/engine dev`, then `deploy-static`): an admin owns a room with two practice partners, one
 * game runs for a while and ends, and the room page and the game's results show the rotation line ("Game 1 of 3 …
 * you get X's rule"); the partners' agents are their rules' example agents. Screenshots to <out-dir>.
 * Usage: node --experimental-transform-types e2e/rotation-shot.ts <out-dir>
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

const { session } = await login("admin");
const me = new ConvexHttpClient(CLOUD);
me.setAuth(await browserJwt(session));
const { roomId, shortCode } = await me.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
await me.mutation(fn.m("rooms:setSpectator"), { roomId, spectator: false });
const owner = (action: string, extra: Record<string, unknown> = {}) => me.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
await admin.mutation(fn.m("aiTemplates:ensureSeeded"), {});
await owner("addAi", { aiAgentId: "practice-example" });
await owner("addAi", { aiAgentId: "practice-example" });
await owner("start");
let gameId = "";
for (let i = 0; i < 180 && !gameId; i++, await sleep(1000)) gameId = ((await me.query(fn.q("player:observation"), { roomId })) as { gameId?: string }).gameId ?? "";
assert.ok(gameId, "the game started");
await admin.mutation(fn.m("testing:patchGame"), { gameId, patch: { planningEndsAt: Date.now() }, kick: true });
await sleep(25_000);
const raw = await admin.query(fn.q("testing:rawGame"), { gameId }) as { agents: { ownerId: string; name: string }[] };
console.log(`practice partners' agents: ${raw.agents.map(a => a.name).join(", ") || "none"}`);
assert.equal(raw.agents.filter(a => a.name === "Example agent").length, 2, "both practice partners summoned their example agent");
await me.mutation(fn.m("rooms:endActiveGame"), { roomId });
await sleep(3000);

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
for (const [label, width, height] of [["desktop", 1440, 900], ["phone", 390, 844]] as const) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.addCookies(session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
  const page = await context.newPage();
  await page.goto(`${SITE}/rooms/${shortCode}`);
  const line = page.getByTestId("text-rotation-line");
  await line.waitFor({ timeout: 30_000 });
  const text = await line.textContent();
  console.log(`${label} room page: ${text}`);
  assert.match(text ?? "", /^Game 1 of 3 in this rotation\. Play again with the same players and you get .+'s rule/);
  await line.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/rotation-room-${label}.png` });
  await context.close();
}
await browser.close();
console.log("ok");
