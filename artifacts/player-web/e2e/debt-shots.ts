/**
 * Screenshots and checks of the debt rule (docs/energy-model.md §7.2) and of the act-cost estimate in the dock's
 * "My agents" panel, from a REAL game on the local deployment (`pnpm --filter @workspace/engine dev`, then
 * `pnpm --filter @workspace/engine deploy-static`): admin owns a room on the default setup with bob and one AI seat.
 *  1. "Steady" writes one number one step away on every act: what it was told an act costs at the summon against what
 *     its acts have cost (the panel's own two numbers, and the engine's).
 *  2. "Spender" rewrites the whole board on credit with 90% of admin's power: it owes after its first act. The panel
 *     is shot with the agent owing, with a lower share typed (what the debt does), with a higher share typed while
 *     admin owes, with Destroy's confirmation open, and after the destroy, when admin itself owes.
 * Each state is shot at 1440×900 and at 390×844.
 * Usage: node --experimental-transform-types e2e/debt-shots.ts <out-dir>
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
const bob = new ConvexHttpClient(CLOUD);
bob.setAuth(await browserJwt((await login("bob")).session));
await admin.mutation(fn.m("aiTemplates:ensureSeeded"), {});
const { DEFAULT_LAYOUT } = await import("@workspace/player-client/layout");

type Agent = { id: string; name: string; energy: number; powerShare?: number; expectedActCost?: number; acts?: number; spent?: number; transforms?: number };
type Obs = { gameId?: string; gameShortCode?: string; language: string; phase: string; self: { energy: number }; agents: Agent[] };

const { roomId, shortCode } = await me.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
await me.mutation(fn.m("rooms:setSpectator"), { roomId, spectator: false });
await bob.mutation(fn.m("rooms:join"), { room: shortCode, spectator: false });
const owner = (action: string, extra: Record<string, unknown> = {}) => me.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await me.mutation(fn.m("rooms:setAiQuotas"), { roomId, aiQuota: 20_000, assistantQuota: 200_000 });
await owner("start");
const observe = () => me.query(fn.q("player:observation"), { roomId }) as Promise<Obs>;
let gameId = "", gameCode = "";
for (let i = 0; i < 180 && !gameId; i++, await sleep(1000)) { const o = await observe(); if (o.gameId) { gameId = o.gameId; gameCode = o.gameShortCode ?? ""; } }
if (!gameId) throw new Error("the game did not start");
await admin.mutation(fn.m("testing:patchGame"), { gameId, patch: { endAtWorld: 5000 } });
const submit = (command: Record<string, unknown>) => me.action(fn.a("commands:submit"), { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), gameId, command } }) as Promise<{ accepted: boolean; message?: string; id?: string; expectedActCost?: number; owed?: number }>;
await me.mutation(fn.m("layout:set"), { roomId, layout: DEFAULT_LAYOUT("running") });
const language = (await observe()).language;
if (language !== "python") throw new Error(`this script writes Python agents; the game's language is ${language}`);

// One number, one step: the same change on every board (a 9 goes down, anything else up).
const STEADY = "def agent(grid):\n    c = grid.cell(0, 0)\n    return [write(c, 8 if c.value == 9 else c.value + 1)]";
// Every number to its complement: a different board every time, and a dear change.
const SPENDER = "def agent(grid):\n    return [write(c, 9 - c.value) for c in grid.cells]";
const steady = await submit({ type: "summon", name: "Steady", language, source: STEADY, powerShare: 0.05 });
log("summon Steady", steady.accepted ? { expectedActCost: steady.expectedActCost } : steady.message);
await admin.mutation(fn.m("testing:patchGame"), { gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 5000 }, kick: true });
for (let i = 0; i < 60 && (await observe()).phase !== "running"; i++) await sleep(1000);

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
type Page = import("playwright").Page;
const open = async (width: number, height: number) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await context.addCookies(session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
  const page = await context.newPage();
  page.on("pageerror", e => log("pageerror", String(e)));
  await page.goto(`${SITE}/rooms/${shortCode}/games/${gameCode}`);
  return page;
};
const desktop = await open(1440, 900), phone = await open(390, 844);
const text = (page: Page, testId: string) => page.locator(`[data-testid="${testId}"]`).first().innerText({ timeout: 3000 }).then(t => t.replace(/\s+/g, " ")).catch(() => null);
/** The My agents panel on both screens: a shot of the page and of the agent's row, and what the named elements say. */
const both = async (name: string, agentId: string | null, ids: string[], act?: (page: Page, size: string) => Promise<void>) => {
  for (const [size, page] of [["desktop", desktop], ["phone", phone]] as const) {
    try {
      if (size === "phone") {
        // The phone shows one panel at a time: bring My agents forward through the tab strip, if it is not already.
        const tab = page.locator('[data-testid^="tab-"]', { hasText: /My agents/ }).first();
        if (await tab.count()) await tab.click({ timeout: 3000 }).catch(() => {});
      }
      if (agentId) await page.locator(`[data-testid="row-agent-${agentId}"]`).scrollIntoViewIfNeeded({ timeout: 15_000 });
      if (act) await act(page, size);
      await sleep(600);
      await page.screenshot({ path: `${OUT}/${name}-${size}.png` });
      if (agentId) await page.locator(`[data-testid="row-agent-${agentId}"]`).screenshot({ path: `${OUT}/${name}-${size}-row.png` }).catch(() => {});
      const said: Record<string, string | null> = {};
      for (const id of ids) said[id] = await text(page, id);
      said.overflow = await page.evaluate(() => `${document.documentElement.scrollWidth} in ${window.innerWidth}`);
      log(`${name} ${size}`, said);
    } catch (e) { log(`FAILED ${name} ${size}`, String((e as Error).message).slice(0, 400)); await page.screenshot({ path: `${OUT}/failed-${name}-${size}.png` }).catch(() => {}); }
  }
};

// ---------------------------------------------------------------- 1. the estimate against the charge
await sleep(20_000);
await auth();
{
  const o = await observe(), a = o.agents.find(x => x.name === "Steady")!;
  const state = await admin.query(fn.q("testing:rawGame"), { gameId }) as { agents: { name: string; acts: number; transforms: number; skips: number; spent: number; spentRead: number; failures?: Record<string, number> }[]; objects: unknown[] };
  const raw = state.agents.find(x => x.name === "Steady")!;
  log("Steady: estimate against charge", { toldAtSummon: steady.expectedActCost, observationExpected: a.expectedActCost, acts: raw.acts, transforms: raw.transforms, failures: raw.failures,
    meanChargePerAct: raw.spent / Math.max(1, raw.acts), meanChargePerChange: (raw.spent - (raw.acts - raw.transforms) * (raw.spentRead / Math.max(1, raw.acts))) / Math.max(1, raw.transforms), objectsNow: state.objects.length });
  await both("1-estimate", a.id, [`text-expected-act-cost-${a.id}`, `text-actual-act-cost-${a.id}`, `text-agent-act-${a.id}`, `text-agent-spent-${a.id}`]);
}

// ---------------------------------------------------------------- 2. an agent that owes
const spender = await submit({ type: "summon", name: "Spender", language, source: SPENDER, powerShare: 0.9 });
log("summon Spender", spender.accepted ? { expectedActCost: spender.expectedActCost } : spender.message);
let owing: Agent | undefined;
for (let i = 0; i < 120 && !owing; i++, await sleep(500)) owing = (await observe()).agents.find(a => a.name === "Spender" && a.energy < -50);
if (!owing) log("FAILED", "Spender never owed"); else {
  const id = owing.id;
  log("Spender owes", { energy: owing.energy, own: (await observe()).self.energy });
  await both("2-agent-owes", id, [`text-agent-energy-${id}`, `text-agent-debt-${id}`, `text-agent-diagnosis-${id}`, "text-own-capacity", "text-unallocated-power"]);
  // A lower share typed, not set: what happens to the debt.
  await both("3-share-lowered-preview", id, [`text-power-preview-${id}`, `text-power-capacity-${id}-0`, `text-power-capacity-${id}-1`, `text-power-capacity-${id}-2`, `text-power-problem-${id}`],
    async page => { await page.locator(`[data-testid="input-power-share-${id}"]`).fill("30"); });
  for (const page of [desktop, phone]) await page.locator(`[data-testid="input-power-share-${id}"]`).fill("90").catch(() => {});
  // Destroy's confirmation.
  await both("4-destroy-confirm", id, [`text-destroy-debt-${id}`, `button-confirm-destroy-${id}`],
    async page => { await page.locator(`[data-testid="button-destroy-agent-${id}"]`).click(); });
  // Destroy it (through the engine, as the button would) while it owes: admin now owes.
  let latest: Agent | undefined;
  for (let i = 0; i < 80; i++, await sleep(250)) { latest = (await observe()).agents.find(a => a.id === id); if (latest && latest.energy < -150) break; }
  const destroyed = await submit({ type: "destroy", agentId: id });
  log("destroy", { accepted: destroyed.accepted, owed: destroyed.owed, agentEnergyBefore: latest?.energy, ownAfter: (await observe()).self.energy });
  const steadyId = (await observe()).agents.find(a => a.name === "Steady")!.id;
  await both("5-you-owe", steadyId, ["text-energy", "text-own-capacity", "text-unallocated-power", "text-energy-income", "text-summon-needs"]);
  // A higher share for Steady typed while admin owes: part of the debt would move to it.
  await both("6-share-raised-while-owing", steadyId, [`text-power-preview-${steadyId}`, `text-power-capacity-${steadyId}-0`, `text-power-capacity-${steadyId}-1`, `text-power-capacity-${steadyId}-2`],
    async page => { await page.locator(`[data-testid="input-power-share-${steadyId}"]`).fill("50"); });
  log("own energy at the end", (await observe()).self.energy);
}
await auth();
await me.mutation(fn.m("rooms:endActiveGame"), { roomId }).catch(e => log("end failed", String(e)));
await browser.close();
process.exit(0);
