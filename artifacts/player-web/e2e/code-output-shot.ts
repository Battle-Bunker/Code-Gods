/**
 * A screenshot of the code-output panel after a REAL assistant turn (opt-in, costs money; the local deployment must be
 * live: `pnpm --filter @workspace/engine assistant:live`). A signed-in player at phone size (390×844) asks the
 * assistant, through the composer, to rank their top 5 objects by payoff and show a table; the shot is of the pane
 * the assistant opened. Usage: node --experimental-transform-types e2e/code-output-shot.ts <out.png>
 */
import "../../engine/scripts/local-only.mjs";
import { createRequire } from "node:module";

const OUT = process.argv[2] ?? "code-output.png";
const CLOUD = process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
const SITE = process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";
const MODEL = process.env.CG_ASSISTANT_MODEL || "claude-sonnet-5-5";
const { browserJwt, login } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const fn = { q: (n: string) => makeFunctionReference<"query">(n), m: (n: string) => makeFunctionReference<"mutation">(n), a: (n: string) => makeFunctionReference<"action">(n) };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const { session } = await login("dana");
const dana = new ConvexHttpClient(CLOUD);
dana.setAuth(await browserJwt(session));
const { roomId, shortCode } = await dana.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
const owner = (action: string, extra: Record<string, unknown> = {}) => dana.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("start");
await dana.mutation(fn.m("rooms:approveAiBudget"), { roomId, aiBudget: 0, assistantBudget: 200_000, assistantModel: MODEL });
// Wait for a world with objects (planning ends on its own; the default is short).
for (let i = 0; i < 120; i++) {
  const o = await dana.query(fn.q("player:observation"), { roomId }) as { phase: string; objects: unknown[] };
  if (o.phase === "running" && o.objects.length >= 5) break;
  await sleep(1000);
}

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await context.addCookies(session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
const page = await context.newPage();
await page.goto(`${SITE}/player/?room=${shortCode}`);
await page.waitForSelector("[data-testid=text-self-label]", { timeout: 60_000 });
// Ask through the composer (on a phone the assistant is a sheet).
const input = page.locator("[data-testid=input-assistant]");
if (!(await input.isVisible().catch(() => false))) await page.locator("[data-testid=button-sheet]").click().catch(() => {});
await input.fill("Rank my top 5 objects by payoff and show a table.");
await input.press("Enter");
const sent = Date.now();
let runId: string | undefined;
for (; Date.now() - sent < 180_000; await sleep(1000)) {
  const { layout } = await dana.query(fn.q("layout:current"), { roomId }) as { layout: { panes: Record<string, { panelId?: string; params?: { runId?: string } }> } };
  const pane = Object.values(layout.panes).find(p => p.panelId === "code-output");
  const threads = await dana.query(fn.q("assistant:threads"), { roomId }) as { activeTurnId?: string }[];
  if (pane && !threads.some(t => t.activeTurnId)) { runId = pane.params?.runId; break; }
}
if (!runId) console.warn("no code-output pane with a runId appeared; shooting the screen as it is");
// Back to the sheet's peek height, so the stacked dock shows the pane.
const sheet = page.locator("[data-snap]").first();
for (let i = 0; i < 3 && (await sheet.getAttribute("data-snap").catch(() => "peek")) !== "peek"; i++) await page.locator("[data-testid=button-sheet]").click().catch(() => {});
await page.locator("[data-testid=table-code-result]").first().waitFor({ timeout: 30_000 }).catch(() => console.warn("no table rendered"));
await page.locator("[data-testid=panel-code-output]").first().scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: OUT, fullPage: false });
const text = await page.locator("[data-testid=panel-code-output]").first().textContent().catch(() => "");
console.log(JSON.stringify({ out: OUT, runId, panelText: (text ?? "").slice(0, 300) }));
await browser.close();
