/**
 * A walk of the embedded assistant with REAL model calls (docs/screenshots/assistant-real/README.md), by hand only:
 * never in CI or a suite. It spends money. Admin, an admin-owned room, one game (GAME_SETUP: lines-beginner or
 * grids-beginner), a 120 s planning and a 10-minute world; logs every turn's latency and last reply to
 * OUT_DIR/log-<setup>.txt and screenshots each step there. STEPS picks the steps (comma-separated):
 *   rule, grant, summon, summonnow, yes, second, deal, dock, run, stop, stopquick, autopilot
 *
 * The local engine refuses real calls by design (scripts/dev.mjs removes provider keys and sets AI_MOCK=1), so turn
 * them on for the walk and off after, in artifacts/engine:
 *   npx convex env set ANTHROPIC_API_KEY "$CODE_GODS_ANTHROPIC_API_KEY" && npx convex env remove AI_MOCK
 *   … run the walk …
 *   npx convex env remove ANTHROPIC_API_KEY && npx convex env set AI_MOCK 1     (restarting dev.mjs does the same)
 * Spend is in the v2AiUsage table (npx convex data v2AiUsage).
 *
 *   OUT_DIR=/tmp/walk GAME_SETUP=lines-beginner STEPS=rule,grant,summonnow node --experimental-transform-types e2e/assistant-real.ts
 */
import "../../engine/scripts/local-only.mjs";
import { spawnSync } from "node:child_process";
import { mkdirSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;
const SITE = "http://127.0.0.1:3211";
const CLOUD = "http://127.0.0.1:3210";
const ROOT = path.resolve(import.meta.dirname, "../../..");
const SETUP = process.env.GAME_SETUP ?? "lines-beginner";
const OUT = process.env.OUT_DIR!;
mkdirSync(OUT, { recursive: true });
const log = (s: string) => { console.log(s); appendFileSync(path.join(OUT, `log-${SETUP}.txt`), s + "\n"); };

if (!process.env.SKIP_DEPLOY) {
  const d = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: ROOT, stdio: "inherit" });
  if (d.status !== 0) throw new Error("deploy-static failed");
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page: Page = await context.newPage();
page.on("pageerror", (e: Error) => log(`PAGE ERROR: ${e.message}`));
await page.goto(`${SITE}/`);
await page.getByTestId("button-login").waitFor();
const url = await page.evaluate(async () => ((await (await fetch("/api/auth/sign-in/oauth2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: "fake", callbackURL: "/" }) })).json()) as { url: string }).url);
await page.goto(url);
await page.getByRole("link", { name: /\(admin\)/ }).click();
await page.waitForURL(`${SITE}/`);
await page.getByTestId("button-avatar").waitFor();
await page.getByTestId("button-create-room").first().click();
await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
const code = page.url().split("/").at(-1)!;
const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
const client = new ConvexHttpClient(CLOUD); client.setAuth(token);
const room = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
const set = await client.mutation("v2/ops/room:settings" as never, { args: { preset: SETUP, overrides: { planningSeconds: 120, worldSeconds: 600 } }, roomId: room.roomId } as never) as { ok: boolean; error?: { message: string } };
log(`room ${code} settings: ${set.ok ? "ok" : set.error?.message}`);
await page.getByTestId("button-practice-game").click();
await page.waitForURL(/\/games\//, { timeout: 30_000 });

const pane = page.getByTestId("pane-assistant");
if (!await pane.count()) {
  await page.locator("[data-testid^=button-pane-menu-]").first().click();
  await page.getByTestId("button-open-pane-assistant").click();
}
await page.locator("[data-testid=pane-assistant], [data-testid=tab-assistant]").first().waitFor({ state: "attached", timeout: 20_000 });
const tab0 = page.getByTestId("tab-assistant");
if (await tab0.count()) await tab0.click();
await pane.getByTestId("assistant").waitFor({ timeout: 20_000 });
let n = 0;
/** The assistant's pane in front: an arrangement can put it behind another tab. */
async function front() {
  if (await pane.getByTestId("input-assistant").isVisible().catch(() => false)) return;
  const tab = page.getByTestId("tab-assistant");
  if (await tab.count()) { await tab.click(); log("  [the assistant's pane was behind a tab: brought to front]"); }
}
const shot = async (name: string) => page.screenshot({ path: path.join(OUT, `${SETUP}-${String(++n).padStart(2, "0")}-${name}.png`) });

/** Sends a message and waits for the turn to finish (the Stop button gone and a new reply), up to `limit` ms. */
async function ask(text: string, name: string, limit = 120_000, stopAfter?: number) {
  await front();
  const before = await pane.getByTestId("row-assistant-reply").count();
  const t0 = Date.now();
  await pane.getByTestId("input-assistant").fill(text);
  await pane.getByTestId("button-assistant-send").click();
  if (stopAfter) {
    await page.waitForTimeout(stopAfter);
    const stop = pane.getByTestId("button-assistant-stop");
    if (await stop.count()) { await stop.click(); log(`  [stop pressed at ${((Date.now() - t0) / 1000).toFixed(1)} s]`); }
    else log("  [no Stop button to press]");
  }
  let done = false;
  while (Date.now() - t0 < limit) {
    await page.waitForTimeout(1000);
    await front();
    const replies = await pane.getByTestId("row-assistant-reply").count();
    const busy = await pane.getByTestId("button-assistant-stop").count();
    const err = await pane.getByTestId("text-assistant-error").count();
    if ((replies > before || err) && !busy) { done = true; break; }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const replies = await pane.getByTestId("row-assistant-reply").allInnerTexts();
  const chips = await pane.getByTestId("chip-assistant").allInnerTexts();
  const err = await pane.getByTestId("text-assistant-error").allInnerTexts();
  log(`\n## ${name} (${done ? "finished" : "TIMED OUT"} in ${secs} s)\n> ${text}\nreply: ${(replies.at(-1) ?? "(none)").replace(/\s+/g, " ").slice(0, 700)}\nchips: ${chips.slice(-8).join(" | ")}${err.length ? `\nERROR: ${err.join(" | ")}` : ""}`);
  await shot(name);
}

const steps = (process.env.STEPS ?? "rule,grant,summon,second,deal,dock,stop,autopilot").split(",");
for (const s of steps) {
  if (s === "rule") await ask("In plain words, what does my rule want? Keep it short.", "rule");
  if (s === "grant") {
    await pane.getByTestId("button-assistant-settings").click();
    await pane.getByTestId("button-assistant-grant-act").click();
    await page.waitForTimeout(1500);
    log(`grant act: ${await pane.getByTestId("text-assistant-allowance").innerText().catch(() => "?")}`);
    await pane.getByTestId("button-assistant-settings").click().catch(() => {});
  }
  if (s === "summon") await ask("Write an agent for my rule from this instruction: move the lines that are closest to scoring for me first, and never spend more than half your energy on one move. Then summon it.", "summon", 180_000);
  if (s === "run") {
    const go = page.getByTestId("button-start-world");
    if (await go.count()) { await go.click(); await go.click().catch(() => {}); }
    await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });
    log("world running");
  }
  if (s === "stopquick") await ask("Write three different agents for my rule, check each one, compare them, and summon the best at 70% of my power.", "stop-quick", 90_000, 1500);
  if (s === "summonnow") await ask("Write an agent for my rule that moves the objects closest to scoring for me first, and summon it now at 70% of my power without asking me.", "summon-now", 180_000);
  if (s === "yes") await ask("Yes: summon the careful agent now at 70% of my power. Don't ask me again for summons in this game.", "yes-summon", 120_000);
  if (s === "second") await ask("Summon a second agent: a bolder one that tries bigger changes. If my own energy can't pay for it, pull power back from my agents to pay, then share the power out again. Tell me in one line what it cost.", "second-fund", 240_000);
  if (s === "deal") {
    await page.locator("[data-testid^=button-pane-menu-]").first().click();
    await page.getByTestId("button-open-pane-public-chat").click().catch(() => {});
    log("deal: (practice partners read no chat; the deal is stated to the assistant)");
    await ask(`I agreed in chat with Practice partner 1: my agents leave ${SETUP.startsWith("grids") ? "grid" : "line"} 3 alone. Make my agents honour that, with the smallest change to their code, and tell me what the edit cost.`, "deal", 180_000);
  }
  if (s === "dock") await ask(`Arrange my screen: put the leaderboard to the right of the ${SETUP.startsWith("grids") ? "grids" : "lines"} list, and open the act log.`, "dock", 120_000);
  if (s === "stop") await ask("Look at every one of my agents and their last ten moves, then rewrite each one to do better.", "stop-midrun", 90_000, 4000);
  if (s === "autopilot") {
    await pane.getByTestId("button-assistant-settings").click();
    await pane.getByTestId("button-assistant-mode-autopilot").click();
    await pane.getByTestId("button-assistant-mode-autopilot").click();
    const t0 = Date.now();
    await page.waitForTimeout(30_000);
    const turns = await pane.getByTestId("row-assistant-turn").allInnerTexts();
    const auto = await pane.getByTestId("text-assistant-autopilot").count();
    log(`\n## autopilot 30 s: ${auto} autopilot marker(s), ${turns.length} turns; last: ${(turns.at(-1) ?? "").replace(/\s+/g, " ").slice(0, 400)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    await shot("autopilot");
    await pane.getByTestId("button-assistant-mode-onRequest").click().catch(() => {});
  }
}
log(`\nend: ${await page.getByTestId("game-bar").innerText().catch(() => "")}`);
await browser.close();
