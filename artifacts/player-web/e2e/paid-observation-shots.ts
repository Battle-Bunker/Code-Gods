/**
 * Screenshots and checks of paid observation (docs/energy-model.md §11) in the dock's Objects panel, from a REAL game on
 * the local deployment (`pnpm --filter @workspace/engine dev`, then `pnpm --filter @workspace/engine deploy-static`):
 * admin owns a room on the default setup with a second human (bob) and one AI seat; both humans summon a changer and
 * admin an observer; the panel is shot in planning, while running (fresh and stale rows), around one look, around the
 * look at all (confirm step), with no energy (disabled looks and the engine's refusal), and on a phone.
 * Usage: node --experimental-transform-types e2e/paid-observation-shots.ts <out-dir>
 */
import "../../engine/scripts/local-only.mjs";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const OUT = (process.argv[2] ?? ".").replace(/\/$/, "");
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
const log = (label: string, value: unknown) => console.log(`## ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

const { session } = await login("admin");
const me = new ConvexHttpClient(CLOUD);
const auth = async () => me.setAuth(await browserJwt(session));
await auth();
const other = await login("bob");
const bob = new ConvexHttpClient(CLOUD);
bob.setAuth(await browserJwt(other.session));

const { roomId, shortCode } = await me.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
await me.mutation(fn.m("rooms:setSpectator"), { roomId, spectator: false });
await bob.mutation(fn.m("rooms:join"), { room: shortCode, spectator: false });
const owner = (action: string, extra: Record<string, unknown> = {}) => me.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
await admin.mutation(fn.m("aiTemplates:ensureSeeded"), {});
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await me.mutation(fn.m("rooms:setAiQuotas"), { roomId, aiQuota: 20_000, assistantQuota: 200_000 });
await owner("start");
type Obs = { gameId?: string; gameShortCode?: string; language: string; phase: string; self: { godId: string; energy: number }; economy: Record<string, unknown>; agents: { id?: string; agentId?: string; name: string; powerShare?: number }[]; objectCount?: number };
const observe = (c = me) => c.query(fn.q("player:observation"), { roomId }) as Promise<Obs>;
let gameId = "", gameCode = "", language = "python";
for (let i = 0; i < 180 && !gameId; i++, await sleep(1000)) {
  const o = await observe();
  if (o.gameId) ({ gameId, gameCode, language } = { gameId: o.gameId, gameCode: o.gameShortCode ?? "", language: o.language });
}
if (!gameId) throw new Error("the game did not start");
await admin.mutation(fn.m("testing:patchGame"), { gameId, patch: { endAtWorld: 5000 } });
const submitAs = (c: typeof me) => (command: Record<string, unknown>) => c.action(fn.a("commands:submit"), { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), gameId, command } }) as Promise<{ accepted: boolean; message: string }>;
const submit = submitAs(me), submitBob = submitAs(bob);
const { DEFAULT_LAYOUT } = await import("@workspace/player-client/layout");
await me.mutation(fn.m("layout:set"), { roomId, layout: DEFAULT_LAYOUT("running") });
const first = await observe();
log("economy", first.economy);
const selfOf = (o: Obs) => ({ ...o.self, utility: undefined });
log("self at start", selfOf(first));

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
type Page = import("playwright").Page;
const open = async (width: number, height: number, scale = 2) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  await context.addCookies(session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
  const page = await context.newPage();
  page.on("pageerror", e => log("pageerror", String(e)));
  await page.goto(`${SITE}/rooms/${shortCode}/games/${gameCode}`);
  return { page, context };
};
const BAR = "[data-testid=objects-paid-observation]";
const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  // The Objects pane on its own, larger in the report.
  const pane = page.locator(".cg-pane", { has: page.locator(BAR) }).first();
  if (await pane.count()) await pane.screenshot({ path: `${OUT}/${name}-pane.png` }).catch(() => {});
  log("shot", `${OUT}/${name}.png`);
};
/** What the panel says, as text: the bar, and every row's foot. */
const panelText = async (page: Page) => ({
  bar: await page.locator(BAR).innerText().catch(() => null),
  header: await page.locator("[data-testid=text-energy]").innerText().catch(() => null),
  rows: await page.locator("[data-testid^=text-seen-]").evaluateAll(els => els.map(e => `${e.getAttribute("data-stale") ? "STALE " : ""}${(e as HTMLElement).innerText.replace(/\s+/g, " ")}`)),
  overflow: await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })),
});
const step = async (name: string, run: () => Promise<void>) => { try { await run(); } catch (e) { log(`FAILED ${name}`, String((e as Error).stack ?? e).slice(0, 800)); await page.screenshot({ path: `${OUT}/failed-${name.replace(/\W+/g, "-")}.png` }).catch(() => {}); } };

const { page } = await open(1440, 900);

await step("1 planning", async () => {
  await page.waitForSelector(BAR, { timeout: 60_000 });
  await page.waitForSelector("[data-testid^=text-seen-]", { timeout: 30_000 });
  await sleep(1500);
  await shot(page, "01-planning");
  log("1 planning panel", await panelText(page));
  await page.locator("[data-testid=button-look-all]").hover();
  log("1 look-all title", await page.getAttribute("[data-testid=button-look-all]", "title"));
});

await step("2 summon", async () => {
  const py = language === "python";
  const changer = (k: number) => py ? `def agent(grid):\n    return [slide(row(${k}), 1)]` : `function agent(grid) { return [slide(row(${k}), 1)]; }`;
  const observer = py ? `def agent(grid):\n    repr(grid)\n    return []` : `function agent(grid) { String(grid); return []; }`;
  log("summon changer", await submit({ type: "summon", name: "Changer", language, source: changer(0) }));
  log("summon observer", await submit({ type: "summon", name: "Observer", language, source: observer }));
  log("bob summon changer", await submitBob({ type: "summon", name: "Bob changer", language, source: changer(1) }));
  log("bob summon changer 2", await submitBob({ type: "summon", name: "Bob changer 2", language, source: changer(2) }));
  await admin.mutation(fn.m("testing:patchGame"), { gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 5000 }, kick: true });
  await sleep(40_000);
});

await step("3 running", async () => {
  await auth();
  const o = await observe();
  log("3 phase", o.phase); log("3 self", selfOf(o)); log("3 agents", o.agents.map(a => ({ name: a.name, powerShare: a.powerShare, acts: (a as { acts?: number }).acts })));
  await page.waitForSelector("[data-testid^=text-seen-]", { timeout: 30_000 });
  await shot(page, "03-running");
  log("3 running panel", await panelText(page));
});

await step("4 one look", async () => {
  // All power to the agents first, so the god's own balance stands still and the look's price is the only change.
  const mine = [...(await observe()).agents].sort((a, b) => Number(b.name === "Observer") - Number(a.name === "Observer"));   // lower the observer first
  for (const [i, a] of mine.entries()) log("4 allocatePower", (await submit({ type: "allocatePower", agentId: a.id ?? a.agentId, share: a.name === "Observer" ? 0.02 : 0.98 / (mine.length - 1) })).message);
  await sleep(8000);   // the observer now looks rarely: the other god's changes leave rows stale
  log("4 self", selfOf(await observe()));
  const button = page.locator("[data-testid^=button-look-]:not([data-testid=button-look-all])").first();
  await button.waitFor({ timeout: 60_000 });
  const id = (await button.getAttribute("data-testid"))!.replace("button-look-", "");
  log("4 look button", { label: await button.innerText(), title: await button.getAttribute("title") });
  const before = await observe();
  await shot(page, "04a-before-look");
  log("4 row before", await page.locator(`[data-testid=text-seen-${id}]`).innerText());
  log("4 header before", await page.locator("[data-testid=text-energy]").innerText());
  await button.click();
  await page.waitForFunction(i => !document.querySelector(`[data-testid=text-seen-${i}]`)?.getAttribute("data-stale"), id, { timeout: 15_000 }).catch(() => log("4", "row still stale after 15 s (or scrolled away)"));
  const after = await observe();
  await shot(page, "04b-after-look");
  log("4 row after", await page.locator(`[data-testid=text-seen-${id}]`).innerText().catch(() => "(row not rendered)"));
  log("4 header after", await page.locator("[data-testid=text-energy]").innerText());
  log("4 energy", { before: before.self.energy, after: after.self.energy, drop: before.self.energy - after.self.energy, lookPrice: before.economy.lookPrice });
  log("4 toasts", await page.locator("[role=status], [data-sonner-toast]").allInnerTexts().catch(() => []));
});

await step("5 look at all", async () => {
  const before = await observe();
  await page.click("[data-testid=button-look-all]");
  await page.waitForSelector("[data-testid=button-confirm-look-all]");
  await shot(page, "05a-look-all-confirm");
  log("5 confirm text", await page.locator(BAR).innerText());
  await page.click("[data-testid=button-confirm-look-all]");
  await sleep(2500);
  const after = await observe();
  await shot(page, "05b-look-all-after");
  log("5 energy", { before: before.self.energy, after: after.self.energy, drop: before.self.energy - after.self.energy, objectCount: after.objectCount });
  log("5 panel after", await panelText(page));
});

await step("6 unaffordable", async () => {
  const o = await observe();
  await admin.mutation(fn.m("testing:setGodEnergy"), { gameId, godId: o.self.godId, balance: 0 });
  await sleep(6000);   // let bob's changers make rows stale again
  log("6 self", selfOf(await observe()));
  await page.waitForSelector("[data-testid=text-look-reason]", { timeout: 20_000 });
  await shot(page, "06-unaffordable");
  log("6 panel", await panelText(page));
  const row = page.locator("[data-testid^=button-look-]:not([data-testid=button-look-all])").first();
  if (await row.count()) log("6 row look", { disabled: await row.isDisabled(), title: await row.getAttribute("title"), label: await row.innerText() });
  else log("6 row look", "no stale row on screen");
  log("6 look-all", { disabled: await page.locator("[data-testid=button-look-all]").isDisabled(), reason: await page.locator("[data-testid=text-look-reason]").innerText() });
  log("6 refusal (all)", await submit({ type: "look" }));
  const ids = await page.locator("[data-testid^=row-object-]").evaluateAll(els => els.map(e => e.getAttribute("data-testid")!.replace("row-object-", "")));
  if (ids[0]) log("6 refusal (one)", await submit({ type: "look", objectId: ids[0] }));
});

await step("8 phone", async () => {
  const { page: phone, context } = await open(390, 844);
  await phone.waitForSelector(BAR, { timeout: 60_000 });
  await phone.waitForSelector("[data-testid^=text-seen-]", { timeout: 30_000 });
  await phone.locator(BAR).scrollIntoViewIfNeeded();
  await sleep(1500);
  await shot(phone, "08a-phone-unaffordable");
  log("8 phone panel (no energy)", await panelText(phone));
  // Give the energy back so the phone also shows live looks.
  await admin.mutation(fn.m("testing:setGodEnergy"), { gameId, godId: (await observe()).self.godId, balance: 60 });
  await sleep(5000);
  await shot(phone, "08b-phone");
  log("8 phone panel", await panelText(phone));
  const all = phone.locator("[data-testid=button-look-all]");
  await all.scrollIntoViewIfNeeded();
  await all.click();
  await phone.waitForSelector("[data-testid=button-confirm-look-all]");
  await shot(phone, "08c-phone-confirm");
  log("8 phone overflow (confirm)", (await panelText(phone)).overflow);
  await phone.click("[data-testid=button-cancel-look-all]");
  const stale = phone.locator("[data-testid^=badge-stale-]").first();
  if (await stale.count()) { await stale.scrollIntoViewIfNeeded(); await sleep(500); await shot(phone, "08d-phone-stale-row"); }
  log("8 row boxes", await phone.locator("[data-testid^=text-seen-]").evaluateAll(els => els.slice(0, 6).map(e => { const span = e.querySelector("span.truncate") as HTMLElement | null; return { text: (e as HTMLElement).innerText.replace(/\s+/g, " "), truncated: span ? span.scrollWidth > span.clientWidth : null }; })));
  await context.close();
});

await auth();
await me.mutation(fn.m("rooms:endActiveGame"), { roomId }).catch(() => {});
console.log(JSON.stringify({ out: OUT, room: shortCode, gameId }));
await browser.close();
process.exit(0);
