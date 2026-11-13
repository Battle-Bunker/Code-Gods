/**
 * Screenshots and checks of paid observation (docs/energy-model.md §11) in the dock's Objects panel, from a REAL game on
 * the local deployment (`pnpm --filter @workspace/engine dev`, then `pnpm --filter @workspace/engine deploy-static`):
 * admin owns a room on the default setup with a second human (bob) and one AI seat; both humans summon a changer and
 * bob two more; the panel is shot in planning, while running (fresh and stale rows), with a board hovered, around one
 * look, with a row's "why?" open, around the look at all (confirm step), with no energy (disabled looks and the engine's
 * refusal), and on a phone. Then one short game on each Lab mode: "boards" (every board live; desktop and phone) and
 * "agents" (no look for the god).
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

await admin.mutation(fn.m("aiTemplates:ensureSeeded"), {});
type Obs = { gameId?: string; gameShortCode?: string; language: string; phase: string; self: { godId: string; energy: number }; economy: Record<string, unknown>; agents: { id?: string; agentId?: string; name: string; powerShare?: number }[]; objectCount?: number };
const { DEFAULT_LAYOUT } = await import("@workspace/player-client/layout");

/** A room of admin (owner), bob and one AI seat, started on the default setup with `settings` over it; in planning. */
async function startGame(settings?: Record<string, unknown>) {
  await auth();
  const { roomId, shortCode } = await me.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
  await me.mutation(fn.m("rooms:setSpectator"), { roomId, spectator: false });
  await bob.mutation(fn.m("rooms:join"), { room: shortCode, spectator: false });
  const owner = (action: string, extra: Record<string, unknown> = {}) => me.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
  await owner("addAi", { aiAgentId: "sonnet-strategist" });
  await me.mutation(fn.m("rooms:setAiQuotas"), { roomId, aiQuota: 20_000, assistantQuota: 200_000 });
  if (settings) {
    const room = await me.query(fn.q("rooms:get"), { room: roomId }) as { revision: number };
    log("settings", await me.action(fn.a("owner:settings"), { roomId, revision: room.revision, settings }).then(r => (r as { message?: string })?.message ?? "applied"));
  }
  await owner("start");
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
  await me.mutation(fn.m("layout:set"), { roomId, layout: DEFAULT_LAYOUT("running") });
  const first = await observe();
  log("economy", first.economy);
  /** Admin's changer on row 0, bob's on rows 1 and 2 (so bob changes what admin's agent does not), then the world runs. */
  const run = async () => {
    const py = language === "python";
    const changer = (k: number) => py ? `def agent(grid):\n    return [slide(row(${k}), 1)]` : `function agent(grid) { return [slide(row(${k}), 1)]; }`;
    log("summon changer", (await submit({ type: "summon", name: "Changer", language, source: changer(0) })).message);
    log("bob summon changer", (await submitBob({ type: "summon", name: "Bob changer", language, source: changer(1) })).message);
    log("bob summon changer 2", (await submitBob({ type: "summon", name: "Bob changer 2", language, source: changer(2) })).message);
    await admin.mutation(fn.m("testing:patchGame"), { gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 5000 }, kick: true });
    for (let i = 0; i < 60 && (await observe()).phase !== "running"; i++) await sleep(1000);
    await sleep(25_000);
    await auth();
  };
  const end = async () => { await auth(); await me.mutation(fn.m("rooms:endActiveGame"), { roomId }).catch(e => log("end failed", String(e))); };
  return { roomId, shortCode, gameId, gameCode, language, observe, submit, run, end };
}
const selfOf = (o: Obs) => ({ ...o.self, utility: undefined });

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
type Page = import("playwright").Page;
const open = async (game: { shortCode: string; gameCode: string }, width: number, height: number, scale = 2) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  await context.addCookies(session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
  const page = await context.newPage();
  page.on("pageerror", e => log("pageerror", String(e)));
  await page.goto(`${SITE}/rooms/${game.shortCode}/games/${game.gameCode}`);
  return { page, context };
};
const BAR = "[data-testid=objects-paid-observation]";
const ROW_LOOK = "[data-testid^=button-look-]:not([data-testid=button-look-all])";
const shot = async (page: Page, name: string, { still = false } = {}) => {
  if (!still) await page.mouse.move(700, 4);   // off the boards: a hovered board opens its scoring popover over the rows
  await sleep(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  // The Objects pane on its own, larger in the report.
  const pane = page.locator(".cg-pane", { has: page.locator(BAR) }).first();
  if (await pane.count()) await pane.screenshot({ path: `${OUT}/${name}-pane.png` }).catch(() => {});
  log("shot", `${OUT}/${name}.png`);
};
/** What the panel says, as text: the bar, and every row's staleness line. */
const panelText = async (page: Page) => ({
  bar: await page.locator(BAR).innerText().catch(() => null),
  staleCount: await page.locator("[data-testid=text-stale-count]").innerText().catch(() => null),
  header: await page.locator("[data-testid=text-energy]").innerText().catch(() => null),
  rows: await page.locator("[data-testid^=text-seen-]").evaluateAll(els => els.map(e => `${e.getAttribute("data-stale") ? "STALE " : ""}${(e as HTMLElement).innerText.replace(/\s+/g, " ")}`)),
  lookButtons: await page.locator("[data-testid^=button-look-]").count(),
  dimmedBoards: await page.locator("[data-testid^=object-seen-]").evaluateAll(els => els.filter(e => /opacity-50/.test(e.className)).length),
  staleBoards: await page.locator("[data-testid^=object-seen-][data-stale]").count(),
  overflow: await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })),
});
let current: Page | undefined;
const step = async (name: string, run: () => Promise<void>) => { try { await run(); } catch (e) { log(`FAILED ${name}`, String((e as Error).stack ?? e).slice(0, 800)); await current?.screenshot({ path: `${OUT}/failed-${name.replace(/\W+/g, "-")}.png` }).catch(() => {}); } };
const ready = async (page: Page) => { await page.waitForSelector(BAR, { timeout: 60_000 }); await page.waitForSelector("[data-testid^=text-seen-]", { timeout: 30_000 }); await page.locator(BAR).scrollIntoViewIfNeeded(); await sleep(1500); };
const waitStale = async (page: Page) => { await page.waitForSelector("[data-testid^=badge-stale-]", { timeout: 90_000 }); await sleep(500); };
const only = process.env.SHOTS_ONLY?.split(",");
const wanted = (mode: string) => !only || only.includes(mode);

// ---- The default: paid observation ----
if (wanted("paid")) {
  const game = await startGame();
  const { observe, submit } = game;
  const { page, context } = await open(game, 1440, 900);
  current = page;

  await step("1 planning", async () => {
    await ready(page);
    await shot(page, "01-paid-planning");
    log("1 planning panel", await panelText(page));
    const all = page.locator("[data-testid=button-look-all]");
    log("1 look-all", { disabled: await all.isDisabled(), title: await all.getAttribute("title"), reason: await page.locator("[data-testid=text-look-reason]").innerText().catch(() => null) });
    log("1 refusal", await submit({ type: "look" }));
  });

  await step("2 running", async () => {
    await game.run();
    const o = await observe();
    log("2 phase", o.phase); log("2 self", selfOf(o));
    await waitStale(page);
    await shot(page, "02-paid-running");
    log("2 running panel", await panelText(page));
  });

  await step("3 hover", async () => {
    // The board's hover popover against the row's staleness line and Look button.
    const board = page.locator("[data-testid^=object-seen-][data-stale]").first();
    await board.scrollIntoViewIfNeeded();
    await board.hover();
    await sleep(900);
    await shot(page, "03-paid-board-hover", { still: true });
    const id = (await board.getAttribute("data-testid"))!.replace("object-seen-", "");
    log("3 hover boxes", await page.evaluate(i => {
      const box = (el: Element | null) => { const r = el?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null; };
      const pop = [...document.querySelectorAll("[role=tooltip], [data-radix-popper-content-wrapper], [data-testid*=popover], [data-testid*=tooltip]")];
      return { seen: box(document.querySelector(`[data-testid=text-seen-${i}]`)), look: box(document.querySelector(`[data-testid=button-look-${i}]`)), popovers: pop.map(p => ({ testid: p.getAttribute("data-testid"), ...box(p) })) };
    }, id));
  });

  await step("4 one look", async () => {
    const button = page.locator(ROW_LOOK).first();
    await button.waitFor({ timeout: 60_000 });
    const id = (await button.getAttribute("data-testid"))!.replace("button-look-", "");
    log("4 look button", { label: await button.innerText(), title: await button.getAttribute("title"), disabled: await button.isDisabled() });
    await button.scrollIntoViewIfNeeded();
    const before = await observe();
    await shot(page, "04a-paid-before-look");
    log("4 row before", (await page.locator(`[data-testid=text-seen-${id}]`).innerText()).replace(/\s+/g, " "));
    log("4 stale count before", await page.locator("[data-testid=text-stale-count]").innerText().catch(() => null));
    await button.click();
    await page.waitForFunction(i => !document.querySelector(`[data-testid=text-seen-${i}]`)?.getAttribute("data-stale"), id, { timeout: 15_000 }).catch(() => log("4", "row still stale after 15 s (or scrolled away)"));
    const after = await observe();
    await shot(page, "04b-paid-after-look");
    log("4 row after", (await page.locator(`[data-testid=text-seen-${id}]`).innerText().catch(() => "(row not rendered)")).replace(/\s+/g, " "));
    log("4 stale count after", await page.locator("[data-testid=text-stale-count]").innerText().catch(() => null));
    log("4 energy", { before: before.self.energy, after: after.self.energy, drop: before.self.energy - after.self.energy, lookPrice: before.economy.lookPrice });
  });

  await step("5 why", async () => {
    const board = page.locator("[data-testid^=object-seen-][data-stale]").first();
    const id = (await board.getAttribute("data-testid"))!.replace("object-seen-", "");
    await page.click(`[data-testid=button-object-detail-${id}]`);
    const detail = page.locator(`[data-testid=object-detail-${id}]`);
    await detail.waitFor({ timeout: 10_000 });
    await detail.scrollIntoViewIfNeeded();
    await shot(page, "05-paid-why");
    log("5 detail", (await page.locator(`[data-testid=text-detail-seen-${id}]`).innerText()).replace(/\s+/g, " "));
    await page.click(`[data-testid=button-object-detail-${id}]`).catch(() => {});
    await page.locator(BAR).scrollIntoViewIfNeeded();
  });

  await step("6 phone", async () => {
    const { page: phone, context: ctx } = await open(game, 390, 844);
    await ready(phone);
    await waitStale(phone);
    await shot(phone, "06a-paid-phone");
    log("6 phone panel", await panelText(phone));
    await phone.evaluate(() => document.querySelector("[data-testid^=badge-stale-]")?.scrollIntoView({ block: "center" })); await sleep(500);
    await shot(phone, "06b-paid-phone-stale-row");
    log("6 phone overflow", (await panelText(phone)).overflow);
    log("6 row boxes", await phone.locator("[data-testid^=text-seen-]").evaluateAll(els => els.slice(0, 6).map(e => { const span = e.querySelector("span.truncate") as HTMLElement | null; return { text: (e as HTMLElement).innerText.replace(/\s+/g, " "), truncated: span ? span.scrollWidth > span.clientWidth : null }; })));
    await ctx.close();
  });

  await step("7 look at all", async () => {
    const before = await observe();
    await page.click("[data-testid=button-look-all]");
    await page.waitForSelector("[data-testid=button-confirm-look-all]");
    await shot(page, "07a-paid-look-all-confirm");
    log("7 confirm text", await page.locator(BAR).innerText());
    await page.click("[data-testid=button-confirm-look-all]");
    await sleep(2500);
    const after = await observe();
    await shot(page, "07b-paid-look-all-after");
    log("7 energy", { before: before.self.energy, after: after.self.energy, drop: before.self.energy - after.self.energy, objectCount: after.objectCount });
    log("7 panel after", await panelText(page));
  });

  await step("8 unaffordable", async () => {
    const o = await observe();
    for (const a of o.agents) log("8 allocatePower", (await submit({ type: "allocatePower", agentId: a.id ?? a.agentId, share: 1 / o.agents.length })).message);
    await admin.mutation(fn.m("testing:setGodEnergy"), { gameId: game.gameId, godId: o.self.godId, balance: 0 });
    await waitStale(page);   // bob's changers make rows stale again
    log("8 self", selfOf(await observe()));
    await page.waitForSelector("[data-testid=text-look-reason]", { timeout: 20_000 });
    await shot(page, "08-paid-unaffordable");
    log("8 panel", await panelText(page));
    const row = page.locator(ROW_LOOK).first();
    if (await row.count()) log("8 row look", { disabled: await row.isDisabled(), title: await row.getAttribute("title"), label: await row.innerText() });
    else log("8 row look", "no stale row on screen");
    log("8 look-all", { disabled: await page.locator("[data-testid=button-look-all]").isDisabled(), reason: await page.locator("[data-testid=text-look-reason]").innerText() });
    log("8 refusal (all)", await submit({ type: "look" }));
    const ids = await page.locator("[data-testid^=row-object-]").evaluateAll(els => els.map(e => e.getAttribute("data-testid")!.replace("row-object-", "")));
    if (ids[0]) log("8 refusal (one)", await submit({ type: "look", objectId: ids[0] }));
  });
  await context.close();
  await game.end();
}

// ---- Lab: boards always visible; Lab: only agents can look ----
for (const mode of ["boards", "agents"] as const) {
  if (!wanted(mode)) continue;
  const n = mode === "boards" ? "10" : "11";
  let game: Awaited<ReturnType<typeof startGame>> | undefined;
  await step(`${n} ${mode}`, async () => {
    game = await startGame({ observation: mode });
    const { page, context } = await open(game, 1440, 900);
    current = page;
    await ready(page);
    await shot(page, `${n}a-${mode}-planning`);
    log(`${n} ${mode} planning panel`, await panelText(page));
    await game.run();
    await waitStale(page);
    await shot(page, `${n}b-${mode}-running`);
    log(`${n} ${mode} running panel`, await panelText(page));
    if (mode === "agents") log(`${n} ${mode} refusal`, await game.submit({ type: "look" }));
    const board = page.locator("[data-testid^=object-seen-][data-stale]").first();
    await board.scrollIntoViewIfNeeded();
    await board.hover(); await sleep(900);
    await shot(page, `${n}c-${mode}-board-hover`, { still: true });
    const id = (await board.getAttribute("data-testid"))!.replace("object-seen-", "");
    await page.click(`[data-testid=button-object-detail-${id}]`);
    await page.locator(`[data-testid=object-detail-${id}]`).scrollIntoViewIfNeeded();
    await shot(page, `${n}f-${mode}-why`);
    log(`${n} ${mode} detail`, (await page.locator(`[data-testid=text-detail-seen-${id}]`).innerText()).replace(/\s+/g, " "));
    if (mode === "boards") {
      const { page: phone } = await open(game, 390, 844);
      await ready(phone);
      await waitStale(phone);
      await shot(phone, `${n}d-${mode}-phone`);
      await phone.evaluate(() => document.querySelector("[data-testid^=badge-stale-]")?.scrollIntoView({ block: "center" })); await sleep(500);
      await shot(phone, `${n}e-${mode}-phone-stale-row`);
      log(`${n} ${mode} phone panel`, await panelText(phone));
    }
    await context.close();
  });
  await game?.end();
}

console.log(JSON.stringify({ out: OUT }));
await browser.close();
process.exit(0);
