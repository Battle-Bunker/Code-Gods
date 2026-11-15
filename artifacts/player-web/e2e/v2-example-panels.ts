/**
 * The example panels (src/panels/examples, offered in "Your panels") against the LIVE local engine: bob starts a
 * practice game, summons her first agent and starts the world; each example is saved as his (panel.save) and opened
 * as a pane, and must render its own content inside its sandboxed frame (no load failure, no crash), with live data.
 * The editor's "Start from an example" fills the editor with an example's code.
 *
 *   pnpm --filter @workspace/player-web run e2e:example-panels        (SKIP_DEPLOY=1 reuses the uploaded build)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const CLOUD = `http://127.0.0.1:${process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3210"}`;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const DIR = path.join(import.meta.dirname, "../src/panels/examples");
/** Each example and what it shows once it has data (its root's test id). */
const EXAMPLES: Record<string, string> = {
  "leaderboard-race": "example-race",
  "my-points-over-time": "example-my-points",
  "agent-energy-timeline": "example-energy",
  "mutator-explorer": "example-mutators",
  "opponent-interests": "example-opponents",
  "salient-to-others": "example-salient",
  "what-if-mutation": "example-what-if",
};
assert.deepEqual(readdirSync(DIR).filter(f => f.endsWith(".tsx")).map(f => f.slice(0, -4)).sort(), Object.keys(EXAMPLES).sort(), "every example is checked");

if (!process.env.SKIP_DEPLOY) {
  const deploy = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: ROOT, stdio: "inherit" });
  assert.equal(deploy.status, 0, "deploy-static failed");
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page: Page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e: Error) => errors.push(e.message));
await page.goto(`${SITE}/`);
await page.getByTestId("button-login").waitFor();
const url = await page.evaluate(async () => {
  const r = await fetch("/api/auth/sign-in/oauth2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: "fake", callbackURL: "/" }) });
  return ((await r.json()) as { url: string }).url;
});
await page.goto(url);
await page.getByRole("link", { name: /\(bob\)/ }).click();
await page.waitForURL(`${SITE}/`);
await page.getByTestId("button-avatar").waitFor();

const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
const client = new ConvexHttpClient(CLOUD);
client.setAuth(token);
type Out = { ok: boolean; result?: any; error?: { message: string } };
const op = async (kind: "query" | "mutation" | "action", name: string, args: Record<string, unknown>) => {
  const out = await (client as any)[kind](name, { args }) as Out;
  assert.ok(out.ok, `${name}: ${out.error?.message}`);
  return out.result;
};
for (const p of (await op("query", "v2/ops/panel:list", {})).panels) if (p.slug.startsWith("ex-")) await op("mutation", "v2/ops/panel:remove", { slug: p.slug });

try {
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
  await page.getByTestId("dock").waitFor({ timeout: 60_000 });

  // "Start from an example" fills the editor.
  const mine = page.getByTestId("pane-my-panels");
  if (!await mine.count()) {
    await page.locator("[data-testid^=button-pane-menu-]").first().click();
    await page.getByTestId("button-open-pane-my-panels").click();
  }
  await mine.getByTestId("select-panel-example").selectOption("leaderboard-race");
  assert.equal(await mine.getByTestId("input-panel-slug").inputValue(), "leaderboard-race");
  assert.match(await mine.getByTestId("input-panel-source").inputValue(), /title: "Leaderboard race"/);

  // Agents and moves, so every example has something to show.
  await page.getByTestId("button-summon-first").click();
  await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
  const startNow = page.getByTestId("button-start-world");
  if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
  await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });

  for (const [file, testId] of Object.entries(EXAMPLES)) {
    const slug = `ex-${file}`.slice(0, 48);
    const saved = await op("action", "v2/ops/panel:save", { slug, source: readFileSync(path.join(DIR, `${file}.tsx`), "utf8") });
    assert.ok(saved.saved, `${file}: ${JSON.stringify(saved.diagnostics)}`);
    if (!await mine.count() && await page.getByTestId("tab-my-panels").count()) { await page.getByTestId("tab-my-panels").click(); await mine.waitFor(); }
    await mine.getByTestId(`button-panel-open-${slug}`).click({ timeout: 30_000 });
    const pane = page.getByTestId(`panel-frame-${slug}`);
    await pane.waitFor({ state: "attached", timeout: 30_000 });
    const frame = page.frameLocator(`[data-testid="panel-frame-${slug}"] iframe`);
    await frame.getByTestId(testId).waitFor({ state: "attached", timeout: 60_000 }).catch(async (e: Error) => {
      const problem = await frame.getByTestId("panel-problem").textContent({ timeout: 1000 }).catch(() => null);
      throw new Error(`${file}: ${testId} never showed (${problem ?? e.message.split("\n")[0]})`);
    });
    assert.equal(await frame.getByTestId("panel-problem").count(), 0, `${file} failed in its frame`);
    console.log(`ok   ${file}: ${(await frame.getByTestId(testId).innerText()).replace(/\s+/g, " ").slice(0, 120)}`);
    // Closed again, so the dock does not fill up.
    await page.getByTestId(`button-pane-menu-panel:${slug}`).click();
    await page.getByTestId(`button-close-pane-panel:${slug}`).click();
  }
  // The what-if example works a move out: its first move with empty arguments is refused or worked, never a crash.
  assert.deepEqual(errors, [], "no page errors");
} finally {
  for (const file of Object.keys(EXAMPLES)) await op("mutation", "v2/ops/panel:remove", { slug: `ex-${file}`.slice(0, 48) }).catch(() => {});
  await browser.close();
}
console.log("ok - every example panel saves, opens and renders live data in its sandboxed frame; the editor starts from an example");
