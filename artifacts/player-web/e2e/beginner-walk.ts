/**
 * A whole beginner game in a browser, as a new player meets it (local deployment: `pnpm --filter @workspace/engine dev`,
 * then `pnpm --filter @workspace/engine deploy-static`): sign in, create a room, "Play a practice game" with AI players
 * on the default setup, summon the example agent the forge offers, watch it score, wait for the end, read the results,
 * open the replay. It clicks only what the page offers (no engine calls), shoots every step, and logs what the page
 * says and how long each step took since the room was created. Nothing is asserted: it is a walk to be read.
 * Usage: node --experimental-strip-types e2e/beginner-walk.ts <out-dir> [desktop|phone] [who=admin]
 * BEGINNER_WALK_STOP=scored stops after the first scoring move (no five-minute wait).
 */
import "../../engine/scripts/local-only.mjs";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const OUT = (process.argv[2] ?? ".").replace(/\/$/, "");
const SIZE = process.argv[3] === "phone" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const WHO = process.argv[4] ?? "admin";
mkdirSync(OUT, { recursive: true });
const SITE = process.env.CG_TEST_SITE_URL ?? "http://127.0.0.1:3211";
const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
type Page = import("playwright").Page;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (label: string, value: unknown) => console.log(`## ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on("pageerror", e => log("PAGEERROR", String(e).slice(0, 400)));
page.on("console", m => { if (m.type() === "error") log("console error", m.text().slice(0, 300)); });

let t0 = Date.now(), n = 0;
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
const say = async (id: string) => page.locator(`[data-testid="${id}"]`).first().innerText({ timeout: 1500 }).then(t => t.replace(/\s+/g, " ").slice(0, 700)).catch(() => null);
/** A step's shot, the named elements' words, and every visible button. */
async function step(name: string, ids: string[] = []) {
  await sleep(700);
  const file = `${String(++n).padStart(2, "0")}-${name}`;
  await page.screenshot({ path: `${OUT}/${file}.png` });
  const said: Record<string, string | null> = {};
  for (const id of ids) said[id] = await say(id);
  const buttons = await page.locator("button:visible, a[data-testid]:visible").evaluateAll(els => els.map(e => (e.getAttribute("data-testid") ?? "") + ":" + ((e as HTMLElement).innerText || e.getAttribute("aria-label") || "").replace(/\s+/g, " ").slice(0, 40)).filter(s => s.length > 1).slice(0, 60));
  log(`${file} (${since()})`, { url: page.url().replace(SITE, ""), ...said, overflow: await page.evaluate(() => `${document.documentElement.scrollWidth}/${window.innerWidth}`) });
  log(`${file} buttons`, buttons.join(" | "));
}
const click = async (id: string, timeout = 30_000) => { await page.locator(`[data-testid="${id}"]`).first().click({ timeout }); };

// ---- sign in (the page starts the test-only provider itself, as the Sign in button would start Google)
await page.goto(`${SITE}/`);
await page.getByTestId("button-login").waitFor();
await step("landing");
const url = await page.evaluate(async () => {
  const r = await fetch("/api/auth/sign-in/oauth2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: "fake", callbackURL: "/" }) });
  return ((await r.json()) as { url: string }).url;
});
await page.goto(url);
await page.getByRole("link", { name: new RegExp(`\\(${WHO}\\)`) }).click();
await page.waitForURL(`${SITE}/`);
await page.getByTestId("button-avatar").waitFor();
await step("home");

// ---- a room, and a practice game
t0 = Date.now();
await click("button-create-room");
await page.waitForURL(/\/rooms\/[0-9A-Z]+$/);
await page.getByTestId("button-copy-link").waitFor();
await step("room", ["text-viewer-seat", "button-practice-game", "text-current-setup", "list-settings"]);
await click("button-practice-game");
await page.waitForURL(/\/games\//, { timeout: 120_000 });
log("game page reached", since());
await step("game-first-sight", ["text-phase", "banner-planning", "text-planning", "panel-bidding", "note-bidding", "note-preparing"]);
// What the page offers a player with no agent.
await page.locator('[data-testid="panel-forge"], [data-testid="button-summon-first-agent"]').first().waitFor({ timeout: 120_000 });
await step("planning", ["text-phase", "banner-planning", "text-planning", "text-first-agent-hint", "panel-utility", "text-energy", "panel-bidding"]);
log("forge source", await page.locator('[data-testid="input-source"]').first().inputValue({ timeout: 3000 }).catch(async () => say("input-source")));
log("forge name", await page.locator('[data-testid="input-agent-name"]').first().inputValue({ timeout: 3000 }).catch(() => null));

// ---- summon the example agent: the header's own button if it is offered, else the forge's
const first = page.locator('[data-testid="button-summon-first-agent"]:visible').first();
const summon = page.locator('[data-testid="button-summon"]:visible').first();
if (await first.count()) { log("summon by", "header button"); await first.click(); }
else if (await summon.count()) { log("summon by", "forge button"); await summon.click(); }
else { log("summon by", "validate first"); await click("button-validate"); await summon.waitFor({ timeout: 60_000 }); await summon.click(); }
await step("summon-clicked", ["text-notice", "text-forge-progress", "text-validation-verdict", "text-summoned", "text-summon-needs", "text-armed", "text-armed-refused", "banner-game-notice"]);
for (let i = 0; i < 90; i++, await sleep(1000)) {
  if (await page.locator('[data-testid="text-summoned"]:visible, [data-testid^="row-agent-"]:visible').count()) break;
  // A second click where the page asks for one (validate, then summon).
  if (await summon.count() && await summon.isEnabled().catch(() => false) && i % 10 === 9) { log("summon clicked again", since()); await summon.click().catch(() => {}); }
}
log("agent summoned", since());
await step("summoned", ["text-notice", "text-summoned", "text-summoned-store", "text-forge-costs", "text-price-parts", "text-phase", "banner-planning", "text-planning", "text-energy"]);

// ---- watch it score: the first act line that says the player's own agent changed something
let scored = false;
for (let i = 0; i < 240 && !scored; i++, await sleep(1000)) {
  const act = await page.locator('[data-testid^="text-agent-act-"]').first().innerText({ timeout: 500 }).catch(() => "");
  const phase = (await say("text-phase")) ?? "";
  if (i % 15 === 0) log(`waiting (${since()})`, { phase, act: act.slice(0, 160), planning: await say("text-planning") });
  if (/changed/.test(act)) { scored = true; log("FIRST SCORING MOVE", `${since()} after creating the room: ${act.replace(/\s+/g, " ").slice(0, 240)}`); }
}
await step("first-move", ["text-phase", "score-now", "text-energy", "banner-game-notice"]);
const row = page.locator('[data-testid^="row-agent-"]').first();
if (await row.count()) { await row.scrollIntoViewIfNeeded().catch(() => {}); await sleep(300); await row.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}-agent-row.png` }).catch(() => {}); log("agent row", (await row.innerText()).replace(/\s+/g, " ").slice(0, 900)); }
if (process.env.BEGINNER_WALK_STOP === "scored") { await browser.close(); process.exit(0); }

// ---- mid-game, then the end
await sleep(60_000);
await step("mid-game", ["text-phase", "score-now", "text-energy"]);
for (let i = 0; i < 420; i++, await sleep(1000)) if (await page.locator('[data-testid="panel-results"]:visible, [data-testid="text-results-headline"]:visible').count()) break;
log("results shown", since());
await step("results", ["text-phase", "text-results-headline", "text-results-exact", "text-results-formula", "panel-results"]);
const why = page.locator('[data-testid="button-results-why"]:visible').first();
if (await why.count()) { await why.click(); await step("results-why", ["section-results-why"]); }
// ---- the replay: whatever the results offer for it
const replay = page.locator('a:visible, button:visible', { hasText: /replay/i }).first();
if (await replay.count()) { log("replay control", (await replay.innerText()).slice(0, 80)); await replay.click(); await sleep(2500); await step("replay", ["text-phase"]); }
else { log("replay control", "none visible on the results"); await page.reload(); await sleep(3000); await step("reloaded-ended-game", ["text-phase"]); }
const full = `${OUT}/${String(++n).padStart(2, "0")}-end-full-page.png`;
await page.screenshot({ path: full, fullPage: true });
await browser.close();
process.exit(0);
