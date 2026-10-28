/**
 * Playwright smoke tests of both UIs (artifacts/code-gods and artifacts/player-web) against a stubbed
 * API. Every request to the fake origin is intercepted: static files come from the two vite builds,
 * /api/* from fixtures built with the real product libraries (e2e/fixtures.ts), and the player socket
 * from page.routeWebSocket. No server, login or database is needed.
 *
 *   pnpm --filter @workspace/code-gods run e2e          (SKIP_BUILD=1 to reuse dist/, SHOTS_DIR=… for screenshots)
 *
 * Needs Playwright with Chromium available to `require("playwright")` (not a package dependency).
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { observationSchema } from "../../../lib/player-client/src/protocol.ts";
import * as F from "./fixtures.ts";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(import.meta.dirname, "../../..");
const apps = { gods: path.join(root, "artifacts/code-gods/dist/public"), player: path.join(root, "artifacts/player-web/dist/public") };
const shots = process.env.SHOTS_DIR ?? path.join(tmpdir(), "code-gods-e2e");
mkdirSync(shots, { recursive: true });
// https so the pages are a secure context (crypto.randomUUID); nothing leaves the browser.
const ORIGIN = "https://code-gods.test";

if (!process.env.SKIP_BUILD) {
  for (const app of ["./artifacts/code-gods", "./artifacts/player-web"]) {
    const env = { ...process.env };
    delete env.PORT; delete env.BASE_PATH; // builds use their own defaults: code-gods at /, player-web at /player/
    const b = spawnSync("pnpm", ["--filter", app, "run", "build"], { cwd: root, stdio: "inherit", env });
    if (b.status !== 0) process.exit(b.status ?? 1);
  }
}
for (const dir of Object.values(apps)) assert.ok(existsSync(path.join(dir, "index.html")), `missing build in ${dir}`);

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain", ".png": "image/png", ".woff2": "font/woff2" };
function staticFile(urlPath: string) {
  const [dir, rel] = urlPath.startsWith("/player") ? [apps.player, urlPath.replace(/^\/player\/?/, "")] : [apps.gods, urlPath.slice(1)];
  let file = path.join(dir, rel);
  if (!file.startsWith(dir) || !existsSync(file) || !path.extname(file)) file = path.join(dir, "index.html"); // SPA fallback
  return { body: readFileSync(file), contentType: TYPES[path.extname(file)] ?? "application/octet-stream" };
}

/** Requests the stub API received (method, path, body), so tests can assert what the UI sent. */
type Sent = { method: string; path: string; body: any };

async function stubbed(browser: any, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const sent: Sent[] = [];
  let obs = F.observation();
  const json = (route: any, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await context.route(`${ORIGIN}/**`, async (route: any) => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
    if (!p.startsWith("/api/")) { const f = staticFile(p); return route.fulfill({ status: 200, body: f.body, contentType: f.contentType }); }
    const body = req.postData() ? JSON.parse(req.postData()) : undefined;
    sent.push({ method, path: p, body });
    const room = /^\/api\/rooms\/([^/]+)(\/.*)?$/.exec(p);
    if (p === "/api/auth/user") return json(route, { user: F.OWNER });
    if (p === "/api/activity") return json(route, { status: "ok" });
    if (p === "/api/manifest") return json(route, F.manifest());
    if (p === "/api/ai-agents") return json(route, { agents: [{ id: "lib-1", name: "Sonnet Oracle", provider: "anthropic", model: "claude-sonnet-5-5" }] });
    if (p === "/api/device/grants") return json(route, { grants: [] });
    if (p === "/api/rooms" && method === "GET") return json(route, F.roomList());
    if (room && !room[2] && method === "GET") return json(route, F.roomState());
    if (room && room[2] === "/games") return json(route, F.history());
    if (room && room[2] === "/actions") return json(route, F.roomState());
    if (/^\/api\/games\/[^/]+\/state$/.test(p)) return json(route, F.gameView());
    if (p.endsWith("/observation")) return json(route, obs);
    if (p.endsWith("/commands")) {
      const c = body.command;
      if (c.type === "destroy") obs = { ...obs, revision: obs.revision + 1, agents: obs.agents.filter(a => a.id !== c.agentId) };
      return json(route, { commandId: body.commandId, accepted: true, message: c.type === "validate" ? "Valid." : `${c.type} accepted.`, ...(c.type === "validate" ? { validation: F.validation } : {}) });
    }
    return json(route, { error: `no stub for ${method} ${p}` }, 404);
  });
  await context.routeWebSocket(/\/api\/rooms\/[^/]+\/ws$/, (ws: any) => {
    ws.send(JSON.stringify({ protocolVersion: 1, type: "player.observation", seq: 1, payload: obs }));
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  return { context, page, sent, errors };
}

async function noHorizontalScroll(page: any, label: string) {
  const { sw, iw, wide } = await page.evaluate(() => {
    const iw = window.innerWidth;
    // The innermost elements sticking out of the viewport, to say what overflows.
    const wide = [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > iw + 0.5 && ![...el.children].some(c => c.getBoundingClientRect().right > iw + 0.5))
      .slice(0, 5).map(el => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right)}px`);
    return { sw: document.documentElement.scrollWidth, iw, wide };
  });
  assert.ok(sw <= iw, `${label}: page scrolls horizontally (${sw}px wide in a ${iw}px viewport): ${wide.join("; ")}`);
}

const results: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  results.push(name);
  console.log(`ok - ${name}`);
}

const VIEWPORTS = [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]] as const;

assert.ok(observationSchema.safeParse(F.observation()).success, "observation fixture matches protocol v3");
const browser = await chromium.launch();
let failed = false;
try {
  for (const [name, viewport] of VIEWPORTS) {
    // --- Room lobby: settings pickers, presets, rule shelf with locked reasons and unlock ------------------
    {
      const { context, page, sent, errors } = await stubbed(browser, viewport);
      await page.goto(`${ORIGIN}/rooms/${F.ROOM_CODE}`);
      await page.getByTestId("object-type-picker").waitFor();
      await check(`${name}: room header shows code, owner and creation date (no room name)`, async () => {
        assert.equal(await page.getByTestId("text-room-code").innerText(), F.ROOM_CODE);
        assert.match(await page.getByTestId("text-room-owner").innerText(), /Ada Lovelace/);
        assert.match(await page.getByTestId("text-room-created").innerText(), /2026/);
      });
      await check(`${name}: presets in learning order, component cards with capability badges`, async () => {
        const presets = await page.getByTestId("settings-presets").locator("button").allInnerTexts();
        assert.deepEqual(presets.map(t => t.split("\n")[0].replace(" ✓", "")), ["First steps", "Classic", "Low income", "Big board", "Master"]);
        assert.equal(await page.getByTestId("button-preset-grid-classic").getAttribute("aria-pressed"), "true");
        assert.equal(await page.getByTestId("type-Grid").getAttribute("aria-checked"), "true");
        const cards = await page.getByTestId("option-symbols-cards").innerText();
        assert.match(cards, /♠ Suits/);
        assert.match(cards, /👑 Picture cards/);
        assert.match(await page.getByTestId("option-symbols-base10").innerText(), /🔟 Place value/);
        assert.match(await page.getByTestId("option-symbols-cards").innerText(), /[+−]\d/, "cards show the rule-shelf delta");
        assert.ok(await page.getByTestId("option-symbols-base12").isDisabled(), "components with no offered instantiation are disabled");
        assert.match(await page.getByTestId("input-interactionRateHz").locator("xpath=ancestor::fieldset[1]").innerText(), /Slower = easier to follow your score/);
        for (const id of ["agentEnergyPerSecond", "agentBatteryActs", "defenceRate", "penaltyWeight"]) assert.ok(await page.getByTestId(`input-${id}`).isVisible(), id);
      });
      await check(`${name}: rule shelf counts, excluded families and locked reasons`, async () => {
        const shelf = page.getByTestId("rule-shelf").first();
        assert.match(await shelf.getByTestId("text-shelf-count").innerText(), /^\d+ of \d+$/);
        assert.equal(await shelf.getByTestId("text-excluded-seed2_patchwork").innerText(), "not dealt in this game");
        await shelf.getByTestId("button-show-locked").click();
        const locked = await shelf.locator('[data-testid^="text-locked-"]').allInnerTexts();
        assert.ok(locked.length > 0);
        assert.ok(locked.every(t => t.startsWith("locked: ")), locked.join(" | "));
        assert.ok(locked.includes("locked: needs ♠ Suits. Pick Playing cards"), locked.join(" | "));
      });
      await page.screenshot({ path: path.join(shots, `room-${name}.png`), fullPage: true });
      await noHorizontalScroll(page, `${name} room`);
      await check(`${name}: unlock applies the patch to the draft and highlights the changed control`, async () => {
        const shelf = page.getByTestId("rule-shelf").first();
        const row = shelf.locator('[data-testid^="row-family-"]', { hasText: "locked: needs ♠ Suits. Pick Playing cards" }).first();
        await row.locator('[data-testid^="button-unlock-"]').click();
        await page.getByTestId("param-symbols").and(page.locator("[data-highlight]")).waitFor({ timeout: 2000 });
        assert.equal(await page.getByTestId("option-symbols-cards").getAttribute("aria-pressed"), "true");
        assert.equal(await page.getByTestId("option-size-7").getAttribute("aria-pressed"), "true", "snapped to the offered Grid(7,cards,rainbow6)");
        assert.ok(await page.getByTestId("button-save-settings").isEnabled());
        await page.screenshot({ path: path.join(shots, `room-${name}-unlocked.png`), fullPage: false });
        await page.getByTestId("button-save-settings").click();
        await page.waitForTimeout(300);
        const save = sent.find(s => s.body?.action === "settings");
        assert.ok(save, "settings action sent");
        assert.equal(save.body.settings.objectType, "Grid");
        assert.deepEqual(save.body.settings.typeArgs, { size: 7, symbols: "cards", colours: "rainbow6" });
        assert.deepEqual(save.body.settings.excludedFamilies, ["seed2_patchwork"]);
        assert.equal("intMin" in save.body.settings || "gridSize" in save.body.settings, false, "no legacy settings fields");
      });
      await check(`${name}: one-click preset sends the preset action`, async () => {
        await page.getByTestId("button-preset-grid-first-steps").click();
        await page.waitForTimeout(300);
        assert.ok(sent.some(s => s.body?.action === "settings" && s.body.preset === "grid-first-steps"));
      });
      assert.deepEqual(errors, []);
      await context.close();
    }
    // --- Game page: a Grid world, public salience only, leaderboard in total payoff ----------------------
    {
      const { context, page, errors } = await stubbed(browser, viewport);
      await page.goto(`${ORIGIN}/games/${F.GAME_CODE}`);
      await page.locator('[data-testid="grid-object"]').first().waitFor();
      await check(`${name}: game page renders the Grid world with ObjectView`, async () => {
        assert.equal(await page.locator('[data-testid^="row-object-"] [data-testid="grid-object"]').count(), 12);
        const label = await page.locator('[data-testid^="row-object-"] [role="img"]').first().getAttribute("aria-label");
        assert.match(label ?? "", /^Grid, 5 by 5 /);
        assert.match(await page.getByTestId("text-instance").innerText(), /Grid\(5,base10,rgby\)/);
        const head = await page.locator("thead").first().innerText();
        assert.match(head, /salience/i);
        assert.doesNotMatch(await page.locator("main").innerText(), /Σ utility|total utility/i);
      });
      await check(`${name}: leaderboard in total payoff with agent count and scoring explainer`, async () => {
        assert.equal(await page.locator('[data-testid^="row-standing-"]').count(), 3);
        assert.match(await page.getByTestId("row-standing-u-ada").innerText(), /412\.6/);
        assert.equal(await page.getByTestId("text-agent-count").textContent(), "9 agents");
        await page.getByTestId("link-scoring-explainer").click();
        await page.getByTestId("how-scoring-works").locator("summary").click();
        assert.match(await page.getByTestId("how-scoring-works").innerText(), /if the others don't care, nobody scores/i);
      });
      await check(`${name}: possible gods grouped by badge with a locked toggle`, async () => {
        const shelf = page.getByTestId("rule-shelf");
        assert.ok(await shelf.getByTestId("shelf-group-everywhere").isVisible());
        assert.equal(await shelf.locator('[data-testid^="button-unlock-"]').count(), 0, "no unlock outside owner settings");
      });
      await page.screenshot({ path: path.join(shots, `game-${name}.png`), fullPage: true });
      await noHorizontalScroll(page, `${name} game`);
      await check(`${name}: grid detail view shows the canonical string and cell names`, async () => {
        await page.locator('[data-testid^="row-object-"] [data-testid="grid-object"]').first().click();
        const detail = page.getByTestId("grid-object-detail");
        await detail.waitFor({ state: "visible", timeout: 3000 });
        assert.equal((await page.getByTestId("grid-object-canonical").innerText()).split("/").length, 5);
        assert.match(await detail.innerText(), /Row 1: \w+, (red|yellow|green|blue)/);
        await page.screenshot({ path: path.join(shots, `game-${name}-detail.png`) });
        await noHorizontalScroll(page, `${name} grid detail`);
        await page.keyboard.press("Escape");
      });
      assert.deepEqual(errors, []);
      await context.close();
    }
    // --- Player console: utility card, rarity, forge with helpers, agent energy ------------------------
    {
      const { context, page, sent, errors } = await stubbed(browser, viewport);
      await page.goto(`${ORIGIN}/player/?room=${F.ROOM_CODE}`);
      await page.getByTestId("utility-card").waitFor({ timeout: 10000 });
      await check(`${name}: utility card with uses chips, source and penalty card`, async () => {
        assert.match(await page.getByTestId("utility-card-name").innerText(), /Green Ones/);
        assert.ok((await page.getByTestId("text-utility-summary").innerText()).length > 10);
        assert.ok(await page.getByTestId("utility-card-uses").isVisible());
        assert.match(await page.getByTestId("text-utility-source").innerText(), /def utility\(grid\):/);
        assert.match(await page.getByTestId("utility-card-penalty").innerText(), /your defence goal/);
        assert.match(await page.getByTestId("text-penalty-source").innerText(), /def penalty\(grid\):/);
      });
      await check(`${name}: objects show ObjectView, rarity and an aggregate-only score breakdown`, async () => {
        const rarity = await page.locator('[data-testid^="text-rarity-"]').allInnerTexts();
        assert.ok(rarity.some(t => /✨ 7\.2 · 1 in 145/.test(t)), rarity.join(" | "));
        assert.ok(rarity.some(t => /an everyday grid/.test(t)), rarity.join(" | "));
        assert.ok(rarity.some(t => /⚠️ redder than \d+% of grids/.test(t)), rarity.join(" | "));
        assert.equal(await page.locator('[data-testid^="row-object-"] [data-testid="grid-object"]').count(), 6);
        await page.getByTestId("button-object-detail-o1").click();
        const detail = await page.getByTestId("object-detail-o1").innerText();
        assert.match(detail, /everyone else, together/);
        assert.match(detail, /1 in 145/);
        assert.match(detail, /rarer than 993 of 1,000 grids/);
      });
      await check(`${name}: agents show energy, eligibility and cooldown`, async () => {
        assert.equal(await page.getByTestId("text-agent-status-agent-1").innerText(), "ready to act");
        assert.match(await page.getByTestId("text-agent-status-agent-2").innerText(), /^cooldown/);
        assert.match(await page.getByTestId("text-agent-energy-agent-1").innerText(), /⚡ 5\.2 bits · 3\.5 per act/);
      });
      await check(`${name}: transformations as before/after boards with changed cells outlined`, async () => {
        const t = page.getByTestId("row-transformation-t1");
        assert.equal(await t.locator('[data-testid="grid-object"]').count(), 2);
        assert.equal(await t.locator('[data-testid="grid-object"]').nth(1).locator("[data-changed]").count(), 2);
      });
      await page.screenshot({ path: path.join(shots, `player-${name}.png`), fullPage: true });
      await noHorizontalScroll(page, `${name} player`);
      await check(`${name}: forge with Room helpers, validate shows summon and per-act cost, summon`, async () => {
        const drawer = page.getByTestId("helpers-drawer");
        await drawer.locator("summary").click();
        assert.ok(await drawer.getByTestId("helpers-read").isVisible());
        assert.ok(await drawer.getByTestId("helpers-mutator").isVisible());
        const editor = page.getByTestId("input-source");
        assert.match(await editor.getAttribute("placeholder") ?? "", /^def agent\(grid\):/);
        await editor.fill("def agent(grid):\n    return [");
        await drawer.locator('[data-testid="helper-row"]').first().click();
        assert.match(await editor.inputValue(), /return \[row$/);
        await editor.fill("def agent(grid):\n    return []\n");
        await page.getByTestId("button-validate").click();
        await page.getByTestId("text-summon-cost").waitFor();
        assert.match(await page.getByTestId("text-summon-cost").innerText(), /^42\.0 bits/);
        assert.match(await page.getByTestId("text-expected-act-cost").innerText(), /^3\.5 bits · about one act every 1\.8s/);
        assert.ok(await page.getByTestId("button-summon").isEnabled());
        await page.getByTestId("button-summon").click();
        await page.waitForTimeout(300);
        assert.ok(sent.some(s => s.body?.command?.type === "summon" && s.body.version === "code-gods.player.v3" && s.body.gameId === F.GAME_ID));
        await page.screenshot({ path: path.join(shots, `player-${name}-forge.png`), fullPage: false });
      });
      await check(`${name}: destroying an agent is free and confirmed inline`, async () => {
        await page.getByTestId("button-destroy-agent-agent-2").click();
        await page.getByTestId("button-confirm-destroy-agent-2").click();
        await page.getByTestId("row-agent-agent-2").waitFor({ state: "detached", timeout: 3000 });
        const d = sent.find(s => s.body?.command?.type === "destroy");
        assert.equal(d?.body.command.agentId, "agent-2");
        assert.equal(d?.body.gameId, F.GAME_ID);
      });
      await noHorizontalScroll(page, `${name} player after forge`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
}
console.log(`\n${results.length} checks passed${failed ? ", then one FAILED" : ""}. Screenshots: ${shots}`);
process.exit(failed ? 1 : 0);
