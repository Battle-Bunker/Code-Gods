/**
 * Multi-client end-to-end test: one engine, three independent player apps, real browsers.
 *
 *   node --experimental-transform-types artifacts/player-web/e2e/multi-client.ts
 *
 * What it simulates:
 *   - The engine: the local Convex backend from `pnpm --filter @workspace/engine dev` (started here if
 *     it is not already running), with the stand-in OIDC provider (Better Auth's test-only "fake") and the mock AI provider.
 *   - Three players (alice, bob, carol) who each run their own copy of the repository as a player app: three
 *     git worktrees of HEAD, each with its own install, panels directory, credential (obtained through
 *     the real device flow) and Vite dev server on its own port.
 *   - Humans, driven by Playwright through each app's own UI, plus one mock AI seat.
 *
 * What it checks (each line printed as ok / FAIL):
 *   the dock: the palette adds a panel and the panel menu changes it, and the layout is stored in the engine; a
 *   layout written to the engine reaches the open client; full Int, string and Grid games (validate + summon in
 *   the Agent code panel, transformations, chat, owner end, room history); live HMR of a new panel in one app
 *   during a running game (it opens as a pane by itself; no reload, live data, the other apps unaffected); a
 *   syntax error contained in its pane; the room assistant acting for its player (chat, summon, owner start)
 *   through `pnpm player assistant`; disclosure in what the assistant receives; both frontends served by the
 *   engine's static hosting; the hosted client at phone size (390×844: no dockview, the assistant as a sheet).
 *
 * Commit before running: the simulated apps are worktrees of HEAD.
 */
import "../../engine/scripts/local-only.mjs";   // refuses to run with CONVEX_DEPLOY_KEY set
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ENGINE = join(ROOT, "artifacts/engine");
const WORK = process.env.CG_E2E_DIR ?? join(ROOT, ".e2e");
const CLOUD = process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
const SITE = process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";
const PLAYERS = ["alice", "bob", "carol"] as const;
type Player = typeof PLAYERS[number];
const PORTS: Record<Player, number> = { alice: 5501, bob: 5502, carol: 5503 };
const LAUNCH_KEYS: Record<Player, string> = { alice: crypto.randomUUID(), bob: crypto.randomUUID(), carol: crypto.randomUUID() };

const results: { name: string; ok: boolean; detail?: string }[] = [];
/** Set once the browsers are up: on a failure, screenshots of every app and what each one shows. */
let diagnose: (label: string) => Promise<void> = async () => {};
async function check(name: string, run: () => Promise<unknown> | unknown) {
  try { await run(); results.push({ name, ok: true }); console.log(`ok   ${name}`); }
  catch (error) {
    const detail = (error as Error).message.split("\n")[0]; results.push({ name, ok: false, detail }); console.log(`FAIL ${name}: ${detail}`);
    await diagnose(name).catch(e => console.log(`     (diagnosis failed: ${(e as Error).message})`));
  }
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until<T>(read: () => Promise<T | undefined | null | false> | T | undefined | null | false, label: string, ms = 60_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value) return value as T;
    if (Date.now() > end) throw new Error(`timed out: ${label}`);
    await sleep(250);
  }
}
const children: ChildProcess[] = [];
function background(cmd: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv; log: string }) {
  const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const out: string[] = [];
  child.stdout!.on("data", d => out.push(String(d))); child.stderr!.on("data", d => out.push(String(d)));
  child.on("exit", () => writeFileSync(join(WORK, opts.log), out.join("")));
  children.push(child);
  return { child, output: () => out.join("") };
}
function stopAll() { for (const c of children) { try { process.kill(-c.pid!, "SIGTERM"); } catch { /* gone */ } } }
process.on("exit", stopAll);
process.on("SIGINT", () => process.exit(130));

mkdirSync(WORK, { recursive: true });

// ------------------------------------------------------------------------------------------------
// engine
// ------------------------------------------------------------------------------------------------
const up = async () => { try { return (await fetch(`${SITE}/api/health`)).ok; } catch { return false; } };
if (!(await up())) {
  console.log("starting the local engine…");
  const engine = background("node", ["scripts/dev.mjs", "--typecheck", "disable"], { cwd: ENGINE, log: "engine.log" });
  await until(() => engine.output().includes("[dev] READY"), "engine ready", 300_000);
}
execFileSync("npx", ["convex", "env", "set", "DEV", "1"], { cwd: ENGINE, stdio: "ignore", env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" } });
const { browserJwt, client, decodeJwt, deviceRequest, poll } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const { DEFAULT_LAYOUT, openPane } = await import("@workspace/player-client/layout");

// ------------------------------------------------------------------------------------------------
// three duplicated repositories (worktrees of HEAD), each a player app
// ------------------------------------------------------------------------------------------------
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const appDir = (p: Player) => join(WORK, `app-${p}`);
for (const p of PLAYERS) {
  const dir = appDir(p);
  if (existsSync(dir) && execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim() !== head) {
    execFileSync("git", ["worktree", "remove", "--force", dir], { cwd: ROOT });
  }
  if (!existsSync(dir)) {
    console.log(`creating ${p}'s player app (worktree of ${head.slice(0, 7)})…`);
    execFileSync("git", ["worktree", "add", "--detach", dir, head], { cwd: ROOT, stdio: "ignore" });
    execFileSync("pnpm", ["install", "--frozen-lockfile", "--offline", "--silent"], { cwd: dir, stdio: "ignore" });
  }
  rmSync(join(dir, "artifacts/player-web/src/panels/test-live.tsx"), { force: true });
}

// ------------------------------------------------------------------------------------------------
// room, credentials (real device flow), seats
// ------------------------------------------------------------------------------------------------
const seed = JSON.parse(execFileSync("node", ["--experimental-transform-types", "--disable-warning=ExperimentalWarning", "scripts/seed-players.ts",
  "--players", PLAYERS.join(","), "--out", join(WORK, "secrets")], { cwd: ENGINE, encoding: "utf8" })) as {
  roomId: string; shortCode: string; players: { identity: Player; session: string; envFile: string }[] };
const { roomId, shortCode } = seed;
const sessionOf = (p: Player) => seed.players.find(x => x.identity === p)!.session;
const secretsOf = (p: Player) => Object.fromEntries(readFileSync(seed.players.find(x => x.identity === p)!.envFile, "utf8").trim().split("\n")
  .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])) as Record<string, string>;
console.log(`room ${shortCode} (${roomId})`);

async function ownerClient() { const c = new ConvexHttpClient(CLOUD); c.setAuth(await browserJwt(sessionOf("alice"))); return c; }
const ref = { action: (n: string) => makeFunctionReference<"action">(n), query: (n: string) => makeFunctionReference<"query">(n) };
async function owner(action: string, extra: Record<string, unknown> = {}) {
  const c = await ownerClient();
  const args: Record<string, unknown> = { roomId, action, requestId: crypto.randomUUID(), ...extra };
  if (action === "settings") args.revision = (await c.query(ref.query("rooms:get"), { room: roomId }) as { revision: number }).revision;
  return c.action(ref.action("owner:command"), args);
}

/**
 * The dock layout the games are played in, written to the engine as that human (the open client follows it, as it
 * would an arrangement made on another device): panel p1 (Agent code; switched to Objects by payoff once the agent
 * runs), My agents, What just changed and Public chat side by side on top, the assistant below.
 */
const PANELS_FOR_PLAY = ["agents", "feed", "public-chat"] as const;
async function arrangeForPlay(p: Player) {
  let layout = DEFAULT_LAYOUT("running");
  layout = { ...layout, panes: { ...layout.panes, p1: { id: "p1", kind: "panel", panelId: "forge", params: {}, setBy: "human" } } };
  for (const panelId of PANELS_FOR_PLAY) layout = openPane(layout, { id: "", kind: "panel", panelId, params: {}, setBy: "human" }).layout;
  const c = new ConvexHttpClient(CLOUD);
  c.setAuth(await browserJwt(sessionOf(p)));
  await c.mutation(makeFunctionReference<"mutation">("layout:set"), { roomId, layout });
  // p1 forge, p3 agents, p4 feed, p5 public chat: all on screen.
  await pages[p].waitForSelector("[data-testid=pane-p5] [data-testid=input-chat]", { state: "attached", timeout: 30_000 });
}
/** Change a pane's panel through its header's panel menu (the player's own control). */
async function choosePanel(p: Player, paneId: string, panelId: string) {
  const page = pages[p];
  if (await page.locator(`[data-testid=tab-${paneId}] [data-testid=menu-panel]`).textContent() === panelTitle(panelId)) return;
  await page.click(`[data-testid=tab-${paneId}] [data-testid=menu-panel]`);
  await page.click(`[data-testid=menu-panel-item-${panelId}]`);
  // The menu hands focus back to its trigger as it closes: let it, before typing anywhere else.
  await page.waitForFunction(([id, title]) => document.querySelector(`[data-testid=tab-${id}] [data-testid=menu-panel]`)?.textContent === title, [paneId, panelTitle(panelId)] as const);
  await sleep(300);
}
const panelTitle = (panelId: string) => ({ forge: "Agent code", objects: "Objects by payoff", race: "Leaderboard race", rules: "How to play" } as Record<string, string>)[panelId] ?? panelId;
/** Run a palette command by its title (Cmd/Ctrl+K, type, Enter). */
async function palette(p: Player, title: string) {
  const page = pages[p];
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[data-testid=dialog-palette]");
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await page.waitForSelector("[data-testid=dialog-palette]", { state: "detached", timeout: 10_000 });
}

/** The player's coding agent: `pnpm player …` inside that player's own app, with that app's secrets. */
function playerCli(p: Player, args: string[], input?: string, secrets = secretsOf(p)) {
  return execFileSync("pnpm", ["-s", "player", ...args], {
    cwd: appDir(p), input, encoding: "utf8", env: { ...process.env, ...secrets, CODE_GODS_STATE_DIR: join(WORK, `state-${p}`) },
  });
}

// ------------------------------------------------------------------------------------------------
// the three player apps (Vite dev servers) and browsers
// ------------------------------------------------------------------------------------------------
for (const p of PLAYERS) {
  const secrets = secretsOf(p);
  background("npx", ["vite", "--config", "vite.config.ts"], {
    cwd: join(appDir(p), "artifacts/player-web"), log: `vite-${p}.log`,
    env: { PORT: String(PORTS[p]), CODE_GODS_ENGINE_URL: secrets.CODE_GODS_ENGINE_URL, CODE_GODS_CREDENTIAL: secrets.CODE_GODS_CREDENTIAL, CODE_GODS_LAUNCH_KEY: LAUNCH_KEYS[p] },
  });
}
for (const p of PLAYERS) await until(async () => { try { return (await fetch(`http://localhost:${PORTS[p]}/`)).ok; } catch { return false; } }, `${p}'s app`, 120_000);

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const pages = {} as Record<Player, import("playwright").Page>;
const navigations = {} as Record<Player, number>;
const pageErrors: string[] = [];
for (const p of PLAYERS) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  navigations[p] = 0;
  page.on("framenavigated", f => { if (f === page.mainFrame()) navigations[p]++; });
  page.on("pageerror", e => pageErrors.push(`${p}: ${e.message}`));
  await page.goto(`http://localhost:${PORTS[p]}/__codegods/launch?key=${LAUNCH_KEYS[p]}`); // the private launch link → the app
  await page.waitForSelector("[data-testid=text-self-label]", { timeout: 60_000 });
  // A dev-server app replaces "/" with its credential's room URL (a same-document navigation, which framenavigated
  // also counts): from here on, one navigation means the page was never reloaded.
  await page.waitForURL(url => /^\/rooms\/[0-9A-Z]+$/.test(url.pathname), { timeout: 30_000 });
  navigations[p] = 1;
  await page.evaluate(() => { (window as unknown as { __e2eMarker: string }).__e2eMarker = "same-document"; });
  pages[p] = page;
}
diagnose = async (label: string) => {
  const slug = label.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
  for (const p of PLAYERS) {
    const page = pages[p];
    await page.screenshot({ path: join(WORK, `fail-${slug}-${p}.png`), fullPage: true }).catch(() => {});
    const info = await page.evaluate(() => ({
      phase: document.querySelector("[data-testid=text-phase]")?.textContent,
      connection: document.querySelector("[data-testid=status-connection]")?.textContent,
      unknown: document.querySelector("[data-testid=banner-unknown]")?.textContent?.slice(0, 160),
      coreError: document.querySelector("[data-testid=banner-core-error]")?.textContent?.slice(0, 160),
      notice: document.querySelector("[data-testid=text-notice]")?.textContent?.slice(0, 160),
      agents: [...document.querySelectorAll("[data-testid^=row-agent-]")].map(e => e.textContent?.match(/(\d+) acts/)?.[1]).join(","),
      transformations: document.querySelectorAll("[data-testid^=row-transformation-]").length,
    })).catch(e => ({ error: (e as Error).message }));
    console.log(`     ${p}: ${JSON.stringify(info)}`);
  }
};
const sameDocument = async (p: Player) => navigations[p] === 1 && await pages[p].evaluate(() => (window as unknown as { __e2eMarker?: string }).__e2eMarker === "same-document");

await check("each app is connected to the shared engine as its own player, with full names", async () => {
  const names = { alice: "Alice Liddell", bob: "Bob Okafor", carol: "Carol Nguyen" } as const;
  for (const p of PLAYERS) {
    assert(await pages[p].textContent("[data-testid=text-self-label]") === names[p], `${p} label`);
    assert(await pages[p].textContent("[data-testid=text-room]") === shortCode, `${p} room`);
    assert(await pages[p].textContent("[data-testid=text-mode]") === "your player app", `${p} mode`);
  }
});

await check("the dock: the default is one panel over the assistant; the palette adds a panel, the panel menu changes it, the engine stores it", async () => {
  const page = pages.alice;
  await page.waitForSelector("[data-testid=dock] [data-testid=assistant-pane]");
  // A long-lived engine may carry alice's arrangement from an earlier run's room: start from the default.
  await palette("alice", "Reset layout");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=dock] [data-testid=menu-panel]").length === 1, null, { timeout: 10_000 });
  await palette("alice", "Add panel: Leaderboard race");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=dock] [data-testid=menu-panel]").length === 2, null, { timeout: 10_000 });
  await choosePanel("alice", "p3", "rules");
  const stored = async () => JSON.stringify((await (await ownerClient()).query(ref.query("layout:current"), { roomId }) as { layout: unknown }).layout);
  await until(async () => /"panelId":"rules"/.test(await stored()), "the layout stored in the engine");
  await page.click("[data-testid=button-close-p3]");
  await until(async () => !/"p3"/.test(await stored()), "the closed pane gone from the engine's layout");
});

await check("a layout written to the engine reaches each open client (four panels over the assistant)", async () => {
  for (const p of PLAYERS) await arrangeForPlay(p);
  for (const p of PLAYERS) assert(await pages[p].locator("[data-testid=dock] [data-testid=menu-panel]").count() === 4, `${p}: four built-in panels`);
});

await check("an AI seat with a budget joins the room (mock provider)", async () => {
  await owner("addAi", { aiAgentId: "sonnet-strategist" });
  await owner("settings", { aiBudget: 50_000 });
  const room = await (await ownerClient()).query(ref.query("rooms:get"), { room: roomId }) as { members: { kind: string }[] };
  assert(room.members.filter(m => m.kind === "ai").length === 1, "one AI member");
});

// ------------------------------------------------------------------------------------------------
// full games
// ------------------------------------------------------------------------------------------------
const AGENTS = {
  Int: { language: "python", source: "def agent(x):\n    return [add(1)]" },
  // A cheap move: rotating all 128 characters costs ~273 bits an act (≈ 2 minutes of agent income); a swap costs a few bits.
  string: { language: "typescript", source: "function agent(s) { return [swapChars(0, 1)]; }" },
  Grid: { language: "python", source: "def agent(grid):\n    return [slide(row(0), 1)]" },
} as const;

async function summonThroughUi(p: Player, language: string, source: string) {
  const page = pages[p];
  // The forge is the Agent code panel; with nothing drafted it opens as the editor.
  await choosePanel(p, "p1", "forge");
  // The game allows both languages: the forge's dropdown lists them, and this agent is written in one.
  const offered = await page.$$eval("[data-testid=select-language] option", os => os.map(o => (o as HTMLOptionElement).value));
  assert(offered.join() === "python,typescript", `${p} forge offers the allowed languages, got ${offered.join()}`);
  await page.selectOption("[data-testid=select-language]", language);
  await page.fill("[data-testid=input-source]", source);
  await page.click("[data-testid=button-validate]");
  // The validation panel starts with VALID or INVALID (followed directly by the cost breakdown).
  await page.waitForFunction(() => /^\s*VALID/.test(document.querySelector("[data-testid=panel-validation]")?.textContent ?? ""), null, { timeout: 120_000 });
  await page.waitForSelector("[data-testid=button-summon]:not([disabled])", { timeout: 30_000 });
  await page.click("[data-testid=button-summon]");
  await page.waitForSelector("[data-testid^=row-agent-]", { timeout: 120_000 });
}

async function playGame(type: keyof typeof AGENTS, start: () => Promise<unknown>, during?: () => Promise<void>) {
  const { language, source } = AGENTS[type];
  await check(`${type} game (${language}): owner configures and starts it`, async () => {
    // A long half-life: the game must not end by its (random) lifetime in the middle of the checks.
    await owner("settings", { settings: { objectType: type, languages: ["python", "typescript"], planningSeconds: 2, halfLifeSeconds: 3600 } });
    await start();
    for (const p of PLAYERS) await pages[p].waitForFunction(t => document.querySelector("[data-testid=text-phase]")?.textContent?.match(/planning|running/i), type, { timeout: 30_000 });
  });
  await check(`${type} game: every human validates and summons an agent through their own app's UI`, async () => {
    await Promise.all(PLAYERS.map(p => summonThroughUi(p, language, source)));
  });
  await check(`${type} game: the world runs and each player sees their own transformations and scores`, async () => {
    for (const p of PLAYERS) {
      await pages[p].waitForSelector("[data-testid^=row-transformation-]", { timeout: 90_000 });
      // The agent runs: the first pane changes from the forge to the objects (the panel menu).
      await choosePanel(p, "p1", "objects");
      await pages[p].waitForSelector("[data-testid^=row-object-]", { timeout: 10_000 });
    }
  });
  await check(`${type} game: public chat typed in one app reaches the others live`, async () => {
    const text = `${type} round: hello from bob`;
    await pages.bob.fill("[data-testid=input-chat]", text);
    await pages.bob.click("[data-testid=button-send-chat]");
    for (const p of ["alice", "carol"] as const) await pages[p].waitForFunction(t => document.body.textContent!.includes(t), text, { timeout: 20_000 });
  });
  if (during) await during();
  await check(`${type} game: the owner ends it and it is in the room's history`, async () => {
    await owner("endGame");
    for (const p of PLAYERS) {
      await pages[p].waitForFunction(() => /ended/i.test(document.querySelector("[data-testid=text-phase]")?.textContent ?? ""), null, { timeout: 30_000 })
        .catch(async () => { throw new Error(`${p} still shows phase ${await pages[p].textContent("[data-testid=text-phase]")}`); });
    }
    const history = await (await ownerClient()).query(ref.query("rooms:history"), { room: roomId }) as { settings: { objectType: string } }[];
    assert(history.some(h => h.settings.objectType === type), "history entry");
  });
}

// Int: started from the engine (the owner's browser session).
await playGame("Int", () => owner("start"));

// string: started by alice's coding agent as her room assistant, with an owner credential she approved.
const ownerSecrets = await (async () => {
  const device = await deviceRequest(roomId, "owner", "alice's coding agent");
  await client(await browserJwt(sessionOf("alice"))).mutation("auth/device:approve", { userCode: device.userCode, ownerConsent: true });
  const claimed = await until(async () => { const r = await poll(device); if (r.status === 200) return r.body; await sleep(2100); return undefined; }, "owner credential");
  return { CODE_GODS_ENGINE_URL: SITE, CODE_GODS_CREDENTIAL: claimed.credential as string };
})();
await playGame("string", async () => {
  const out = JSON.parse(playerCli("alice", ["assistant", "room-command"], JSON.stringify({ action: "start", requestId: crypto.randomUUID() }), ownerSecrets));
  assert(JSON.stringify(out).includes("gameId") || out.ok !== false, `start via assistant: ${JSON.stringify(out).slice(0, 200)}`);
}, async () => {
  await check("assistant (bob's coding agent, act credential): chats and summons on bob's behalf", async () => {
    const chat = { version: "code-gods.player.v3", commandId: crypto.randomUUID(), command: { type: "chat", text: "assistant speaking for bob" } };
    const receipt = JSON.parse(playerCli("bob", ["assistant", "command"], JSON.stringify(chat)));
    assert(JSON.stringify(receipt).includes("\"accepted\":true"), `chat receipt ${JSON.stringify(receipt).slice(0, 200)}`);
    await pages.carol.waitForFunction(() => document.body.textContent!.includes("assistant speaking for bob"), null, { timeout: 20_000 });
    const observation = JSON.parse(playerCli("bob", ["assistant", "observation"]));
    const gameId = JSON.stringify(observation).match(/"gameId":"([^"]+)"/)?.[1];
    // Bob's god energy went into his first summon; it accrues in real time, so the assistant retries until
    // it covers the price. A refused command has a final receipt, so each attempt is a new command.
    const result = await until(() => {
      const summon = { version: "code-gods.player.v3", commandId: crypto.randomUUID(), gameId,
        command: { type: "summon", language: "typescript", source: "function agent(s) { return [swapChars(1, 2)]; }" } };
      const receipt = JSON.parse(playerCli("bob", ["assistant", "command"], JSON.stringify(summon)));
      const text = JSON.stringify(receipt);
      if (text.includes("\"accepted\":true")) return text;
      assert(text.includes("Insufficient energy"), `summon receipt ${text.slice(0, 300)}`);
      return undefined;
    }, "bob's god energy covers a second summon", 180_000);
    assert(result, "summon accepted");
    await pages.bob.waitForFunction(() => document.querySelectorAll("[data-testid^=row-agent-]").length >= 2, null, { timeout: 30_000 });
  });
  await check("assistant observation discloses only bob's own scores and peer aggregates", async () => {
    const text = playerCli("bob", ["assistant", "observation"]);
    // God ids are Better Auth user ids: read alice's and carol's from their browser JWTs.
    const subjectOf = async (p: Player) => decodeJwt(await browserJwt(sessionOf(p))).payload.sub as string;
    for (const forbidden of [await subjectOf("alice"), await subjectOf("carol")]) {
      // Opponents appear only as leaderboard/chat identities, never with per-object scores.
      const objects = JSON.stringify((JSON.parse(text) as { observation?: { objects?: unknown[] }; objects?: unknown[] }).observation?.objects ?? (JSON.parse(text) as { objects?: unknown[] }).objects ?? []);
      assert(!objects.includes(forbidden), `objects mention ${forbidden}`);
    }
    assert(!/"scores"|descriptor|"utility":\{"familyId"[^}]*"params"/.test(text), "raw scores or descriptors leaked");
  });
  await check("a read-only Agent cannot act (the engine refuses)", async () => {
    const device = await deviceRequest(roomId, "read", "carol's read-only Agent");
    await client(await browserJwt(sessionOf("carol"))).mutation("auth/device:approve", { userCode: device.userCode });
    const claimed = await until(async () => { const r = await poll(device); if (r.status === 200) return r.body; await sleep(2100); return undefined; }, "read credential");
    const chat = { version: "code-gods.player.v3", commandId: crypto.randomUUID(), command: { type: "chat", text: "should not appear" } };
    let refused = false;
    try { playerCli("carol", ["assistant", "command"], JSON.stringify(chat), { CODE_GODS_ENGINE_URL: SITE, CODE_GODS_CREDENTIAL: claimed.credential }); }
    catch { refused = true; }
    assert(refused, "read credential submitted a command");
  });
});

// Grid: the HMR test runs while it is live.
await playGame("Grid", () => owner("start"), async () => {
  const panelFile = join(appDir("alice"), "artifacts/player-web/src/panels/test-live.tsx");
  await check("HMR: a panel written into alice's app mid-game appears without a reload and updates live", async () => {
    writeFileSync(panelFile, `import { definePanel, useGame, useObjects } from "@sdk";
export default definePanel({ title: "Test live", placement: "left", Component() {
  const game = useGame({ hz: 4 }); const objects = useObjects({ hz: 4 });
  return <p data-testid="test-live">world {game?.worldSeconds.toFixed(2)} objects {objects.length} phase {game?.phase}</p>;
} });
`);
    await pages.alice.waitForSelector("[data-testid=test-live]", { timeout: 20_000 });
    const first = await pages.alice.textContent("[data-testid=test-live]");
    await pages.alice.waitForFunction(t => document.querySelector("[data-testid=test-live]")?.textContent !== t, first, { timeout: 20_000 });
    assert(await sameDocument("alice"), "alice's page reloaded");
  });
  await check("HMR: bob's and carol's apps are unaffected (no panel, no reload)", async () => {
    for (const p of ["bob", "carol"] as const) {
      assert(await pages[p].$$eval("[data-panel-file]", els => els.length) === 0, `${p} has panels`);
      assert(await sameDocument(p), `${p} reloaded`);
    }
  });
  await check("a syntax error in the panel is contained in its frame; the game keeps updating", async () => {
    writeFileSync(panelFile, `import { definePanel } from "@sdk";\nexport default definePanel({ title: "Test live", Component() { return <p>broken</p> ; } ) ;;; <<<\n`);
    await pages.alice.waitForSelector("[data-testid='panel-error-test-live.tsx']", { timeout: 20_000 });
    const message = await pages.alice.textContent("[data-testid='panel-error-test-live.tsx']");
    assert(/test-live\.tsx|Unexpected|expected/i.test(message ?? ""), `error text: ${message}`);
    const objects = await pages.alice.$$eval("[data-testid^=row-object-]", els => els.length);
    assert(objects > 0, "core console still shows the world");
    await pages.carol.fill("[data-testid=input-chat]", "still playing");
    await pages.carol.click("[data-testid=button-send-chat]");
    await pages.alice.waitForFunction(() => document.body.textContent!.includes("still playing"), null, { timeout: 30_000 })
      .catch(async () => { throw new Error(`chat did not arrive; carol's notice: ${await pages.carol.textContent("[data-testid=text-notice]").catch(() => "none")}`); });
    assert(await sameDocument("alice"), "alice's page reloaded");
  });
  await check("fixing or deleting the broken panel recovers without a reload", async () => {
    writeFileSync(panelFile, `import { definePanel } from "@sdk";\nexport default definePanel({ title: "Test live", Component() { return <p data-testid="test-live">fixed</p>; } });\n`);
    await pages.alice.waitForFunction(() => document.querySelector("[data-testid=test-live]")?.textContent === "fixed", null, { timeout: 20_000 });
    rmSync(panelFile);
    await pages.alice.waitForFunction(() => !document.querySelector("[data-panel-file='test-live.tsx']"), null, { timeout: 20_000 });
    assert(await sameDocument("alice"), "alice's page reloaded");
  });
});

// ------------------------------------------------------------------------------------------------
// static hosting by the engine
// ------------------------------------------------------------------------------------------------
await check("the engine serves both frontends (static hosting with SPA fallback)", async () => {
  execFileSync("node", ["scripts/deploy-static.mjs"], { cwd: ENGINE, stdio: "ignore", env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" } });
  for (const path of ["/", `/rooms/${shortCode}`, "/client/", `/client/rooms/${shortCode}`, `/player/?room=${shortCode}`]) {
    const r = await fetch(`${SITE}${path}`);
    assert(r.ok && (r.headers.get("content-type") ?? "").includes("text/html"), `${path}: ${r.status} ${r.headers.get("content-type")}`);
  }
  const html = await (await fetch(`${SITE}/client/`)).text();
  const asset = html.match(/\/client\/assets\/[^"]+\.js/)?.[0];
  assert(asset, "player asset link");
  const r = await fetch(`${SITE}${asset}`);
  assert(r.ok && /javascript/.test(r.headers.get("content-type") ?? ""), `asset ${asset}: ${r.status}`);
});
await check("the hosted player client (engine site, /client/) plays as the signed-in human, and opens past games read-only", async () => {
  const context = await browser.newContext();
  // carol's Better Auth session cookie (seed-players' `session` is the cookie header her sign-in produced).
  await context.addCookies(sessionOf("carol").split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
  const page = await context.newPage();
  // An old invite link (/player/?room=) lands on /client/rooms/CODE; an unknown code (rooms.get throws NOT_FOUND) is
  // answered on the form, not by the page's error boundary.
  await page.goto(`${SITE}/player/?room=NOSUCHROOM`);
  await page.getByTestId("text-room-error").filter({ hasText: "No room NOSUCHROOM on this engine." }).waitFor({ timeout: 60_000 });
  assert(new URL(page.url()).pathname === "/client/rooms/NOSUCHROOM", `legacy link canonicalised: ${page.url()}`);
  await page.getByTestId("input-room-id").fill(shortCode.toLowerCase());
  await page.getByTestId("button-open-room").click();
  // The label renders "—" until the viewer's identity has loaded: wait for a real name, then compare.
  await page.waitForFunction(() => { const t = document.querySelector("[data-testid=text-self-label]")?.textContent; return !!t && t !== "—"; }, null, { timeout: 60_000 }).catch(() => {});
  const label = await page.textContent("[data-testid=text-self-label]");
  assert(label === "Carol Nguyen", `hosted identity: ${JSON.stringify(label)}`);
  assert(await page.textContent("[data-testid=text-mode]") === "hosted client", "hosted mode");
  assert(new URL(page.url()).pathname === `/client/rooms/${shortCode}`, `the room's canonical URL: ${page.url()}`);
  // The room's past games, then one of them read-only, by in-app navigation.
  await page.getByTestId("link-past-games").click();
  await page.getByTestId("screen-past-games").waitFor({ timeout: 30_000 });
  // carol played the earlier games of this room, which a later launch made past games.
  const links = page.locator("[data-testid^=link-past-game-]");
  await links.first().waitFor({ timeout: 30_000 });
  const last = links.last();   // the oldest: a past game whatever the room is doing now
  const code = (await last.getAttribute("data-testid"))!.replace("link-past-game-", "");
  await last.click();
  await page.getByTestId("historic-game").waitFor({ timeout: 30_000 });
  assert(new URL(page.url()).pathname === `/client/rooms/${shortCode}/games/${code}`, `historic game URL: ${page.url()}`);
  assert((await page.textContent("[data-testid=text-game-status]"))?.includes("read-only"), "read-only");
  assert(await page.locator("[data-testid=table-final-standings] tr").count() > 0, "final standings");
  await context.close();
});

await check("at phone size (390×844) the same layout is stacked, the assistant is a sheet, dockview is never loaded", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await context.addCookies(sessionOf("carol").split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
  const page = await context.newPage();
  const scripts: string[] = [];
  page.on("request", r => { if (r.resourceType() === "script" || r.resourceType() === "stylesheet") scripts.push(r.url()); });
  page.on("pageerror", e => pageErrors.push(`phone: ${e.message}`));
  await page.goto(`${SITE}/client/rooms/${shortCode}`);
  await page.waitForSelector("[data-testid=dock-stacked]", { timeout: 60_000 });
  await page.waitForSelector("[data-testid=dock-stacked] [data-testid=assistant-pane]", { state: "attached" });
  // carol's layout from the games: four built-in panels, each stacked with its own header.
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=dock-stacked] [data-testid=menu-panel]").length === 4, null, { timeout: 30_000 });
  assert(await page.locator(".dv-dockview").count() === 0, "dockview rendered on a phone");
  assert(!scripts.some(url => /\/desktop-[^/]*\.(js|css)$/.test(url)), `the desktop dock was downloaded: ${scripts.filter(u => /desktop/.test(u)).join(", ")}`);
  const width = await page.evaluate(() => document.scrollingElement!.scrollWidth);
  assert(width <= 390, `the page scrolls sideways: ${width}px`);
  await page.click("[data-testid=button-sheet]");
  await page.waitForSelector(".cg-sheet[data-snap=half] [data-testid=assistant-pane]", { timeout: 5_000 });
  assert(await page.textContent("[data-testid=text-self-label]") === "Carol Nguyen", "identity on the phone");
  await context.close();
});

await check("no uncaught page errors in any player app", () => assert(pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ")));

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
stopAll();
process.exit(failed.length ? 1 : 0);
