/**
 * The README's screenshots (docs/readme/), taken from a REAL game on the local engine:
 *
 *   pnpm --filter @workspace/engine dev            # in another terminal; wait for "[dev] READY"
 *   pnpm --filter @workspace/engine deploy-static  # builds the engine UI and /client/ into the local deployment
 *   cd artifacts/player-web && node --experimental-transform-types e2e/readme-shots.ts <out-dir>
 *
 * Bob owns a First Steps room with Alice and two AI seats; the room allows Python, TypeScript and Haskell. Bob summons
 * a Python and a TypeScript agent, Alice a Haskell one, they talk in public chat, and the world runs. The script then
 * photographs Bob's hosted client: the live dock with the board, the leaderboard and the assistant (hero.png; the
 * assistant is the local mock provider, so its words are scripted here, while its tool calls are real), his goal card
 * with an annotation under the pointer (goal-card.png), the agent editor after a free validation (agent.png), and the
 * replay once the owner ends the game (replay.png). Raw PNGs at 2x; compress them before committing (docs/readme/README.md).
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

// ---- a real game ----------------------------------------------------------------------------------------------
const as = async (who: string) => { const { session } = await login(who); const c = new ConvexHttpClient(CLOUD); c.setAuth(await browserJwt(session)); return { c, session }; };
const bob = await as("bob"), alice = await as("alice");
const { roomId, shortCode } = await bob.c.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
await alice.c.mutation(fn.m("rooms:join"), { room: roomId });
const owner = (action: string, extra: Record<string, unknown> = {}) => bob.c.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
await admin.mutation(fn.m("aiTemplates:ensureSeeded"), {});
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
const room = await bob.c.query(fn.q("rooms:get"), { room: roomId }) as { revision: number };
// Goals only from families with interactive annotations, so the goal card's example answers the pointer.
const { FAMILIES, LENSES } = await import("@workspace/game-utilities");
const annotated = new Set(LENSES.map(l => l.familyId));
const excludedFamilies = FAMILIES.filter(f => f.objectType === "Grid" && f.role === "reward" && !annotated.has(f.familyId ?? f.id)).map(f => f.id);
await owner("settings", { revision: room.revision, settings: { languages: ["python", "typescript", "haskell"], planningSeconds: 600, halfLifeSeconds: 3600, excludedFamilies } });
await bob.c.mutation(fn.m("rooms:approveAiBudget"), { roomId, aiBudget: 20_000, assistantBudget: 200_000 });
await owner("start");
let gameId = "", gameCode = "";
for (let i = 0; i < 180 && !gameId; i++, await sleep(1000)) {
  const o = await bob.c.query(fn.q("player:observation"), { roomId }) as { gameId?: string; gameShortCode?: string };
  if (o.gameId) ({ gameId, gameShortCode: gameCode } = { gameId: o.gameId, gameShortCode: o.gameShortCode ?? "" });
}
assert.ok(gameId, "the game started");
type God = typeof bob;
const submit = (who: God, command: Record<string, unknown>) => who.c.action(fn.a("commands:submit"), { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), gameId, command } });
/** Summon, retrying while the language's sandbox warms (launches are async). */
const summon = async (who: God, language: string, source: string) => {
  for (let i = 0; i < 60; i++, await sleep(2000)) {
    const r = await submit(who, { type: "summon", name: "Test agent", language, source }) as { accepted: boolean; message: string };
    if (r.accepted) return;
    if (!/warm|ready/i.test(r.message)) throw new Error(`${language}: ${r.message}`);
  }
  throw new Error(`${language}: the sandbox never warmed`);
};
await summon(bob, "python", "def agent(grid):\n    # keep the top row moving, like a conveyor belt\n    return [slide(row(0), 1)]");
await summon(bob, "typescript", "function agent(grid) {\n  // slide the second column along by one\n  return [slide(column(1), 1)];\n}");
await summon(alice, "haskell", "agent :: Obj -> [Call]\nagent grid = [slide' (row 2) 1 \"both\"]");
await submit(alice, { type: "chat", text: "Anyone else care about the top row? I'd like it to settle down." });
await submit(bob, { type: "chat", text: "Maybe. What's it worth to you?" });
await admin.mutation(fn.m("testing:patchGame"), { gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 100_000 }, kick: true });
await sleep(20_000);

// ---- Bob's hosted client ----------------------------------------------------------------------------------------
type Layout = Record<string, unknown>;
const tabs = (id: string) => ({ type: "tabs", panes: [id], active: id });
const panel = (id: string, panelId: string) => ({ id, kind: "panel", panelId, params: {}, setBy: "human" });
const setLayout = (layout: Layout) => bob.c.mutation(fn.m("layout:set"), { roomId, layout });
const beside = (panelId: string, sizes = [62, 38]): Layout => ({ version: 1, root: { type: "split", direction: "row", sizes, children: [tabs("p1"), tabs("p2")] },
  panes: { p1: panel("p1", panelId), p2: { id: "p2", kind: "assistant" } } });

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await context.addCookies(bob.session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
const page = await context.newPage();
const url = `${SITE}/client/rooms/${shortCode}/games/${gameCode}`;
// Hero layout: the board by payoff, the leaderboard race (it samples while open) and the assistant.
await setLayout({ version: 1, root: { type: "split", direction: "row", sizes: [56, 44], children: [tabs("p1"),
  { type: "split", direction: "column", sizes: [50, 50], children: [tabs("p3"), tabs("p2")] }] },
  panes: { p1: panel("p1", "objects"), p3: panel("p3", "race"), p2: { id: "p2", kind: "assistant" } } });
await page.goto(url);
await page.waitForSelector("[data-testid=dock]", { timeout: 60_000 });

// The assistant: the mock provider speaks the script below, and its tools (get_observation, open_panel, send_chat) run for real.
const script = { steps: [
  { text: "Let me look at the board and at what the others seem to care about.", tools: [{ name: "get_observation", input: { objectsLimit: 8 } }] },
  { text: "I've put your objects in order of payoff on the left.", tools: [{ name: "open_panel", input: { panelId: "objects" } }] },
  { text: "Your best objects pay because the others care about them too, so you win while they stay as they are. "
    + "Your Python agent keeps sliding the top row, and Alice just asked for that row to settle down. "
    + "That's a bargaining chip: offer to stop it if she leaves column 1 alone. Shall I post the offer?",
    tools: [{ name: "send_chat", input: { text: "Offer: I'll stop moving the top row if column 1 is left alone. Deal?" } }] },
] };
await page.fill("[data-testid=input-assistant]", `/mock ${JSON.stringify(script)}`);
await page.press("[data-testid=input-assistant]", "Enter");
await page.waitForSelector("[data-testid=button-confirm-approve]", { timeout: 60_000 });
// The mock is driven by a script in the player's message; show the question the script answers instead of the script.
await page.evaluate(() => { const m = document.querySelector("[data-testid=assistant-user-message]"); if (m) m.textContent = "What should I do next?"; });
await sleep(15_000);
await page.evaluate(() => { const m = document.querySelector("[data-testid=assistant-user-message]"); if (m) m.textContent = "What should I do next?"; });
await page.screenshot({ path: `${OUT}/hero.png` });
// Bob approves the offer: it goes to the public chat.
await page.click("[data-testid=button-confirm-approve]");
await sleep(1500);

// The goal card, with the annotation of one cell of its example board under the pointer.
await setLayout(beside("my-card", [66, 34]));
const board = page.locator("[data-testid=goal-example-board]");
await board.waitFor({ timeout: 30_000 });
const cell = board.locator("[data-cell]").nth(5);
const box = await cell.boundingBox();
if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
await sleep(1500);
await page.screenshot({ path: `${OUT}/goal-card.png`, clip: { x: 0, y: 0, width: 845, height: 495 } });

// The agent editor after a free validation.
await setLayout(beside("forge"));
await page.waitForSelector("[data-testid=input-source]", { timeout: 30_000 });
await page.fill("[data-testid=input-source]", [
  "def agent(grid):",
  "    # find the row that is most out of order, and sort it",
  "    def drops(line):",
  "        return sum(1 for a, b in zip(line, line[1:]) if b.value < a.value)",
  "    worst = max(range(len(grid.rows)), key=lambda i: drops(grid.rows[i]))",
  "    return [sort_line(row(worst))]",
  ""].join("\n"));
await page.click("[data-testid=button-validate]");
await page.waitForFunction(() => /VALID/.test(document.querySelector("[data-testid=panel-validation]")?.textContent ?? ""), null, { timeout: 120_000 });
assert.ok(!/INVALID/.test(await page.textContent("[data-testid=panel-validation]") ?? ""), "the sample agent validates");
await sleep(800);
await page.screenshot({ path: `${OUT}/agent.png`, clip: { x: 0, y: 0, width: 794, height: 720 } });

// The replay: the owner ends the game; every god's goal, agent and score is revealed.
await bob.c.mutation(fn.m("rooms:endActiveGame"), { roomId });
const { DEFAULT_LAYOUT } = await import("@workspace/player-client/layout");
await setLayout(DEFAULT_LAYOUT("running"));
await page.goto(url);
await page.waitForSelector("[data-testid=replay-transport]", { timeout: 60_000 });
await page.waitForSelector("[data-testid=panel-timeline]", { timeout: 30_000 });
await sleep(2000);
// The transport and the two panels above the assistant (whose first message is the mock's script).
await page.screenshot({ path: `${OUT}/replay.png`, clip: { x: 0, y: 0, width: 1280, height: 438 } });
await browser.close();
console.log(JSON.stringify({ out: OUT, room: shortCode, game: gameCode }));
