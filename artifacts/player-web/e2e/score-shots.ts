/**
 * Screenshots of the score a player can read, in the REAL player app on a Vite dev server of this checkout: the goal
 * card ("Your points now", the latest act line, "How scoring works") and My agents (energy as ⚡, each agent's latest
 * act), at 1440×900 and 390×844. Needs the local engine. Seeds a room of three players, starts a game, summons one
 * agent for alice and waits until it has changed an object.
 *
 *   node --experimental-transform-types e2e/score-shots.ts <out-dir>
 */
import "../../engine/scripts/local-only.mjs";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { VERSION } from "@workspace/player-client";

const OUT = resolve(process.argv[2] ?? "score-shots");
mkdirSync(OUT, { recursive: true });
const WORK = mkdtempSync(join(tmpdir(), "score-shots-"));
process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";
const ENGINE = new URL("../../engine", import.meta.url).pathname;
const settings = { planningSeconds: 2, halfLifeSeconds: 3600 };
const seed = JSON.parse(execFileSync("node", ["--experimental-transform-types", "--disable-warning=ExperimentalWarning", "scripts/seed-players.ts",
  "--players", "alice,bob,carol", "--out", join(WORK, "secrets"), "--settings", JSON.stringify(settings)], { cwd: ENGINE, encoding: "utf8" })) as {
  roomId: string; shortCode: string; players: { identity: string; session: string; envFile: string }[] };
const env = Object.fromEntries(readFileSync(seed.players[0].envFile, "utf8").trim().split("\n").map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const { browserJwt } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const alice = new ConvexHttpClient(process.env.CG_TEST_CLOUD_URL);
alice.setAuth(await browserJwt(seed.players[0].session));
const roomId = seed.roomId;
await alice.action(makeFunctionReference<"action">("owner:command"), { roomId, action: "start", requestId: randomUUID() });
type Obs = { phase: string; gameId?: string; instance?: { mutators: { id: string; name: string }[] }; transformations: unknown[] };
const observe = () => alice.query(makeFunctionReference<"query">("player:observation"), { roomId }) as Promise<Obs>;
let obs = await observe();
for (let i = 0; i < 120 && obs.phase !== "running" && obs.phase !== "planning"; i++) { await sleep(500); obs = await observe(); }
console.log("phase:", obs.phase, JSON.stringify((obs as any).notice ?? null), "ended:", JSON.stringify((obs as any).endReason ?? (obs as any).ended ?? null));
console.log("mutators:", obs.instance?.mutators.map(m => m.id).join(", "));
const source = process.env.SCORE_SHOTS_AGENT ?? "def agent(grid):\n    return [count_on([1, 0], 1)]\n";
const summoned = await alice.action(makeFunctionReference<"action">("commands:submit"), {
  roomId, envelope: { version: VERSION, commandId: randomUUID(), gameId: obs.gameId, command: { type: "summon", name: "Nudger", language: "python", source } },
}) as { accepted: boolean; message?: string };
console.log("summon:", summoned.accepted, summoned.message ?? "");
for (let i = 0; i < 40 && !(await observe()).transformations.length; i++) await sleep(1000);
console.log("phase after the wait:", (await observe()).phase, "transformations:", (await observe()).transformations.length);

const PORT = 22798, KEY = "score-shots-key";
const vite = spawn("npx", ["vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--strictPort"], {
  cwd: new URL("..", import.meta.url).pathname, stdio: "ignore", detached: true,
  env: { ...process.env, PORT: String(PORT), CODE_GODS_ENGINE_URL: env.CODE_GODS_ENGINE_URL, CODE_GODS_CREDENTIAL: env.CODE_GODS_CREDENTIAL, CODE_GODS_LAUNCH_KEY: KEY },
});
const stop = () => { try { process.kill(-vite.pid!, "SIGTERM"); } catch { /* gone */ } };
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* not yet */ } await sleep(1000); }

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
try {
  for (const [name, viewport] of [["desktop-1440x900", { width: 1440, height: 900 }], ["phone-390x844", { width: 390, height: 844 }]] as const) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", e => console.log("pageerror:", String(e).slice(0, 300)));
    await page.goto(`http://127.0.0.1:${PORT}/__codegods/launch?key=${KEY}`);
    await page.waitForFunction(() => /running|ended/i.test(document.querySelector("[data-testid=text-phase]")?.textContent ?? ""), null, { timeout: 120_000 });
    for (const [panel, title, testId] of [["goal", "Your secret goal", "panel-utility"], ["agents", "My agents", "text-unallocated-power"]] as const) {
      await page.keyboard.press("Control+k");
      await page.waitForSelector("[data-testid=dialog-palette]");
      await page.keyboard.type(title);
      await page.keyboard.press("Enter");
      const target = page.locator(`[data-testid=${testId}]`).first();
      await target.waitFor({ timeout: 30_000 });
      await target.scrollIntoViewIfNeeded();
      await sleep(2500);
      await page.screenshot({ path: join(OUT, `${panel}-${name}.png`) });
      // The energy explanation is behind "How energy works" (closed by default): open it before reading its text.
      await page.locator("[data-testid=details-how-energy-works] summary").first().click({ timeout: 2000 }).catch(() => {});
      for (const id of ["text-points-now", "text-latest-act", "text-energy-income", "scoring-points"]) {
        const el = page.locator(`[data-testid=${id}]`).first();
        if (await el.count()) console.log(`${name} ${panel} ${id}:`, (await el.innerText()).replace(/\s+/g, " "));
      }
      for (const el of await page.locator("[data-testid^=text-agent-act-]").all()) console.log(`${name} ${panel} act:`, (await el.innerText()).replace(/\s+/g, " "));
    }
    await context.close();
  }
  console.log("score shots: ok", OUT);
} catch (e) {
  for (const page of browser.contexts().flatMap(c => c.pages())) await page.screenshot({ path: join(OUT, "failure.png") }).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  stop();
  rmSync(WORK, { recursive: true, force: true });
}
