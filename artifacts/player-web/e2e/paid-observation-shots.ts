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
/** SHOTS_FOCUS=abc: the row height, the hover popover and the forge's observer template only (skips the energy steps). */
const focus = process.env.SHOTS_FOCUS === "abc" || process.env.SHOTS_FOCUS === "b";
/** SHOTS_FOCUS=b: the hover popover only. */
const onlyB = process.env.SHOTS_FOCUS === "b";

/** Change a pane's panel through its header's panel menu (as a player does). */
const choosePanel = async (page: Page, paneId: string, panelId: string, title: string) => {
  const menu = page.locator(`[data-testid=tab-${paneId}] [data-testid=menu-panel]`);
  if ((await menu.textContent()) === title) return;
  await menu.click();
  await page.click(`[data-testid=menu-panel-item-${panelId}]`);
  await page.waitForFunction(([id, t]) => document.querySelector(`[data-testid=tab-${id}] [data-testid=menu-panel]`)?.textContent === t, [paneId, title] as const, { timeout: 15_000 });
  await sleep(500);
};

/** Every row's own height against what it holds: a clipped row (scrollHeight > clientHeight) or an empty band below. */
const rowBoxes = (page: Page) => page.evaluate(() => {
  const paneOf = (sel: string) => [...document.querySelectorAll(".cg-pane")].find(p => p.querySelector(sel));
  const pane = paneOf("[data-testid=objects-paid-observation]");
  const rows = [...document.querySelectorAll("[data-testid^=row-object-]")] as HTMLElement[];
  return {
    paneWidth: pane ? Math.round(pane.getBoundingClientRect().width) : null,
    listWidth: Math.round(document.querySelector("[data-testid=list-objects]")?.getBoundingClientRect().width ?? 0),
    rows: rows.map(r => {
      const rect = r.getBoundingClientRect();
      const id = r.getAttribute("data-testid")!.replace("row-object-", "");
      const edge = (el: Element | null, which: "top" | "bottom") => el ? Math.round(el.getBoundingClientRect()[which] - rect.top) : null;
      let content = 0;
      for (const el of r.querySelectorAll("*")) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) content = Math.max(content, b.bottom - rect.top);
      }
      return {
        id: id.slice(-4), stale: !!r.querySelector(`[data-testid=text-seen-${id}][data-stale]`),
        clientHeight: r.clientHeight, scrollHeight: r.scrollHeight, clipped: r.scrollHeight > r.clientHeight,
        seenTop: edge(r.querySelector(`[data-testid=text-seen-${id}]`), "top"),
        whyBottom: edge(r.querySelector(`[data-testid=button-object-detail-${id}]`), "bottom"),
        lookBottom: edge(r.querySelector(`[data-testid=button-look-${id}]`), "bottom"),
        contentBottom: Math.round(content), bandBelow: Math.round(rect.height - content),
      };
    }),
  };
});

/** The hover popover of one row's board against that row's staleness line and Look button (boxes and a hit test). */
const hoverBoxes = (page: Page, id: string) => page.evaluate(i => {
  const box = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  const content = document.querySelector("[data-testid=grid-object-detail]");
  const pop = box(content), seen = box(document.querySelector(`[data-testid=text-seen-${i}]`)), look = box(document.querySelector(`[data-testid=button-look-${i}]`));
  const intersects = (a: typeof pop, b: typeof pop) => a && b ? !(a.bottom <= b.top || b.bottom <= a.top || a.x + a.w <= b.x || b.x + b.w <= a.x) : null;
  const at = (b: typeof pop, dx = b!.w / 2) => {
    const el = b && document.elementFromPoint(Math.min(innerWidth - 2, b.x + dx), b.y + b.h / 2);
    if (!el) return null;
    const named = el.closest("[data-testid]")?.getAttribute("data-testid");
    const wrapper = el.closest("[data-radix-popper-content-wrapper]");
    const r = wrapper?.getBoundingClientRect();
    return named ?? (wrapper ? `popper-wrapper(bottom ${Math.round(r!.bottom)}, pointer-events ${getComputedStyle(wrapper).pointerEvents})` : `${el.tagName}.${(el.className || "").toString().slice(0, 60)}`);
  };
  return {
    side: content?.getAttribute("data-side") ?? null, popover: pop, seen, look,
    coversSeen: intersects(pop, seen), coversLook: intersects(pop, look),
    popBottomToSeenTop: pop && seen ? Math.round(seen.top - pop.bottom) : null,
    onSeenLine: seen ? at(seen, 24) : null, onLookButton: look ? at(look) : null,
  };
}, id);

/** The id of the stale board lowest (or highest) on screen. */
const pickBoard = (page: Page, which: "low" | "high") => page.evaluate(w => {
  const els = [...document.querySelectorAll("[data-testid^=object-seen-][data-stale]")];
  const visible = els.filter(e => { const r = e.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight; });
  const sorted = (visible.length ? visible : els).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const el = w === "low" ? sorted[sorted.length - 1] : sorted[0];
  return el ? el.getAttribute("data-testid")!.replace("object-seen-", "") : null;
}, which);

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

  await step("2b row heights (A)", async () => {
    await page.locator(BAR).scrollIntoViewIfNeeded();
    await sleep(500);
    log("2b desktop rows", await rowBoxes(page));
  });

  await step("3 hover", async () => {
    // (B) The board's hover popover against the row's staleness line and Look button, low in the pane (it flips above
    // the board) and high in it (it opens below).
    for (const which of ["low", "high"] as const) {
      const id = await pickBoard(page, which);
      if (!id) { log(`3 ${which}`, "no stale board on screen"); continue; }
      const board = page.locator(`[data-testid=object-seen-${id}]`);
      await board.scrollIntoViewIfNeeded();
      await board.hover();
      await sleep(900);
      await shot(page, `03-paid-board-hover-${which}`, { still: true });
      log(`3 hover ${which}`, await hoverBoxes(page, id));
      // The row's Look button while the popover is open: a click must reach it (Playwright names whatever intercepts it).
      const look = page.locator(`[data-testid=button-look-${id}]`);
      if (which === "low" && await look.count()) {
        log("3 click look under the popover", await look.click({ timeout: 5000 }).then(() => "clicked").catch(e => String((e as Error).message).split("\n").slice(0, 8).join(" / ")));
        await sleep(1500);
        log("3 row after that click", (await page.locator(`[data-testid=text-seen-${id}]`).innerText().catch(() => "(row gone)")).replace(/\s+/g, " "));
      }
      await page.mouse.move(700, 4);
      await sleep(500);
    }
  });

  if (!onlyB) await step("4 one look", async () => {
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

  if (!onlyB) await step("5 why", async () => {
    const board = page.locator("[data-testid^=object-seen-][data-stale]").first();
    const id = (await board.getAttribute("data-testid"))!.replace("object-seen-", "");
    await page.click(`[data-testid=button-object-detail-${id}]`);
    const detail = page.locator(`[data-testid=object-detail-${id}]`);
    await detail.waitFor({ timeout: 10_000 });
    await detail.scrollIntoViewIfNeeded();
    await shot(page, "05-paid-why");
    log("5 detail", (await page.locator(`[data-testid=text-detail-seen-${id}]`).innerText()).replace(/\s+/g, " "));
    log("5 rows with why open", await rowBoxes(page));
    await page.click(`[data-testid=button-object-detail-${id}]`).catch(() => {});
    await page.locator(BAR).scrollIntoViewIfNeeded();
  });

  if (!onlyB) await step("6 phone", async () => {
    const { page: phone, context: ctx } = await open(game, 390, 844);
    await ready(phone);
    await waitStale(phone);
    await shot(phone, "06a-paid-phone");
    log("6 phone panel", await panelText(phone));
    await phone.evaluate(() => document.querySelector("[data-testid^=badge-stale-]")?.scrollIntoView({ block: "center" })); await sleep(500);
    await shot(phone, "06b-paid-phone-stale-row");
    log("6 phone overflow", (await panelText(phone)).overflow);
    log("6 row boxes", await phone.locator("[data-testid^=text-seen-]").evaluateAll(els => els.slice(0, 6).map(e => { const span = e.querySelector("span.truncate") as HTMLElement | null; return { text: (e as HTMLElement).innerText.replace(/\s+/g, " "), truncated: span ? span.scrollWidth > span.clientWidth : null }; })));
    log("6 phone rows (A)", await rowBoxes(phone));
    // (C) The forge's observer template on the phone, before anything is loaded into the editor.
    await step("6c phone forge", async () => {
      await choosePanel(phone, "p1", "forge", "Agent code");
      // The template is under "Other starting points", closed until asked for.
      await phone.click("[data-testid=details-other-starts] summary", { timeout: 20_000 });
      await phone.waitForSelector("[data-testid=text-observer-template]", { timeout: 20_000 });
      await phone.locator("[data-testid=text-observer-template]").scrollIntoViewIfNeeded();
      await sleep(400);
      await shot(phone, "06c-phone-forge-observer");
      log("6c phone template", (await phone.locator("[data-testid=text-observer-template]").innerText()).replace(/\s+/g, " "));
      log("6c phone overflow", await phone.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })));
      await choosePanel(phone, "p1", "my-card", "Your secret goal").catch(() => {});
    });
    await ctx.close();
  });

  if (!onlyB) await step("9 forge observer (C)", async () => {
    await choosePanel(page, "p1", "forge", "Agent code");
    await page.waitForSelector("[data-testid=panel-forge]", { timeout: 20_000 });
    await page.click("[data-testid=details-other-starts] summary", { timeout: 20_000 });
    const tpl = page.locator("[data-testid=text-observer-template]");
    await tpl.waitFor({ timeout: 20_000 });
    log("9 template", (await tpl.innerText()).replace(/\s+/g, " "));
    log("9 live objects", { objectCount: (await observe()).objectCount, economy: (await observe()).economy });
    await shot(page, "09a-forge-observer-template");
    await page.click("[data-testid=button-observer-template]");
    await sleep(800);
    log("9 after click", {
      source: await page.inputValue("[data-testid=input-source]"),
      name: await page.inputValue("[data-testid=input-agent-name]"),
      description: await page.inputValue("[data-testid=input-agent-description]"),
      templateStillShown: await page.locator("[data-testid=text-observer-template]").count(),
    });
    await shot(page, "09b-forge-observer-loaded");
    await page.click("[data-testid=button-validate]");
    await page.waitForFunction(() => /VALID/.test(document.querySelector("[data-testid=panel-validation]")?.textContent ?? ""), null, { timeout: 120_000 });
    log("9 validation", (await page.locator("[data-testid=panel-validation]").innerText()).replace(/\s+/g, " | "));
    log("9 warnings", await page.locator("[data-testid=text-validation-warnings]").innerText().catch(() => null));
    await shot(page, "09c-forge-observer-validation");
    const before = await panelText(page);
    log("9 panel before summon", { staleCount: before.staleCount, staleBoards: before.staleBoards, rows: before.rows });
    await page.waitForSelector("[data-testid=button-summon]:not([disabled])", { timeout: 30_000 });
    await page.click("[data-testid=button-summon]");
    await page.waitForSelector("[data-testid^=row-agent-]", { timeout: 120_000 }).catch(() => log("9", "no agent row after the summon"));
    log("9 notice", await page.locator("[data-testid=text-notice]").innerText().catch(() => null));
    await sleep(20_000);
    const after = await panelText(page);
    log("9 panel after 20 s", { staleCount: after.staleCount, staleBoards: after.staleBoards, rows: after.rows });
    log("9 self", selfOf(await observe()));
    await shot(page, "09d-forge-observer-running");
  });

  if (!focus) await step("7 look at all", async () => {
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

  if (!focus) await step("8 unaffordable", async () => {
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
