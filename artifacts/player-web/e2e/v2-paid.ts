/**
 * Every game pays to look (owner decisions 33 and 35; v1's paid observation), in the app against the LIVE local engine,
 * on both beginner setups (lines, grids), at desktop with a phone screenshot: each one shows when you last saw it with a
 * freshness mark and how often it changed since; a look shows its price, and a look shows it as it is now; "Look at
 * all" sums the rows' prices; "Keep my lines fresh" summons a Watcher (an agent that only looks). No free/paid choice.
 *
 *   pnpm --filter @workspace/player-web run e2e:paid        (SKIP_DEPLOY=1 reuses the uploaded build)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const CLOUD = `http://127.0.0.1:${process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3210"}`;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const shots = process.env.SHOTS_DIR ?? path.join(import.meta.dirname, "shots");
mkdirSync(shots, { recursive: true });

if (!process.env.SKIP_DEPLOY) {
  const deploy = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: ROOT, stdio: "inherit" });
  assert.equal(deploy.status, 0, "deploy-static failed");
}

async function signIn(browser: any, who: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  await page.goto(`${SITE}/`);
  await page.getByTestId("button-login").waitFor();
  const url = await page.evaluate(async () => {
    const r = await fetch("/api/auth/sign-in/oauth2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: "fake", callbackURL: "/" }) });
    return ((await r.json()) as { url: string }).url;
  });
  await page.goto(url);
  await page.getByRole("link", { name: new RegExp(`\\(${who}\\)`) }).click();
  await page.waitForURL(`${SITE}/`);
  await page.getByTestId("button-avatar").waitFor();
  return { context, page, errors };
}

/** The room's next game with these overrides, through its owner's own session (the room.settings affordance). */
async function setUp(page: Page, code: string, ...calls: Record<string, unknown>[]) {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  const { roomId } = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  for (const args of calls.map(c => ("preset" in c ? c : { overrides: c }))) {
    const out = await client.mutation("v2/ops/room:settings" as never, { args, roomId } as never) as { ok: boolean; error?: { message: string } };
    assert.ok(out.ok, `room.settings: ${out.error?.message}`);
  }
}


async function paidGame(browser: any, preset: string, noun: { one: string; many: string }) {
  const { context, page, errors } = await signIn(browser, "alice");
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  const code = page.url().split("/").at(-1)!;
  await setUp(page, code, { preset }, { planningSeconds: 5, worldSeconds: 180 });
  await page.getByTestId("text-next-game-summary").getByText(/a look costs [\d.]+× the read price/).waitFor({ timeout: 15_000 });
  assert.equal(await page.getByTestId("select-setting-observation").count(), 0, "no free/paid choice");
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
  await page.getByTestId("button-summon-first").click();
  await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
  const startNow = page.getByTestId("button-start-world");
  if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
  await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });
  if (await page.getByTestId("tab-objects").count()) await page.getByTestId("tab-objects").click({ position: { x: 6, y: 10 } });
  // Each row: when you last saw it, with its mark; the list: look at all (priced) and keep them fresh.
  await page.locator("[data-testid^=text-seen-line-]").first().waitFor({ timeout: 30_000 });
  await page.locator("[data-testid^=mark-fresh-line-]").first().waitFor();
  // Decision 36: your agents tell you every object they act on, free. How stale does a beginner's view get with only the
  // Simple starter? Every 2 s for 30 s, each row's age ("seen N s ago").
  const ages: number[] = [];
  for (let i = 0; i < 15; i++) {
    for (const t of await page.locator("[data-testid^=text-seen-line-]").allInnerTexts()) {
      const m = /seen (\d+) (s|min) ago/.exec(t);
      if (m) ages.push(Number(m[1]) * (m[2] === "min" ? 60 : 1));
    }
    await page.waitForTimeout(2000);
  }
  ages.sort((a, b) => a - b);
  const q = (p: number) => ages[Math.min(ages.length - 1, Math.floor(p * ages.length))];
  console.log(`${preset}: view age with one Simple starter over 30 s (${ages.length} samples): median ${q(0.5)} s, 90% ${q(0.9)} s, max ${ages.at(-1)} s; calm (≤ 10 s) ${Math.round(100 * ages.filter(a => a <= 10).length / ages.length)}%`);
  await page.screenshot({ path: path.join(shots, `paid-${preset}-beginner-view.png`) });
  // The same beginner view on a phone: the Lines pane with its marks and the folded extras.
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.getByTestId("button-jump-objects").count()) await page.getByTestId("button-jump-objects").click();
  await page.locator("[data-testid^=text-seen-line-]").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.screenshot({ path: path.join(shots, `paid-${preset}-beginner-view-phone.png`) });
  await page.setViewportSize({ width: 1440, height: 900 });
  if (await page.getByTestId("tab-objects").count()) await page.getByTestId("tab-objects").click({ position: { x: 6, y: 10 } });
  // Looking is an extra (decision 36): behind "Want to see them sooner?".
  await page.getByTestId("details-look-more").click();
  const all = page.getByTestId("button-look-all");
  await all.waitFor();
  assert.match(await all.innerText(), new RegExp(`^Look at every ${noun.one} now \\([\\d.]+ energy\\)$`), "look at all is priced, never a wrong count");
  await page.screenshot({ path: path.join(shots, `paid-${preset}-list.png`) });
  // One the practice partners changed since you saw it: its own Look, priced, shows it as it is now.
  // One that changed since you saw it, if any does within a minute (decision 36 keeps most views fresh); else the first.
  const changed = page.locator("[data-testid^=text-seen-line-]", { hasText: /changed \d+×/ }).first();
  const stale = await changed.waitFor({ timeout: 60_000 }).then(() => true, () => false);
  const row = stale ? changed : page.locator("[data-testid^=text-seen-line-]").first();
  const n = (await row.getAttribute("data-testid"))!.slice("text-seen-line-".length);
  if (stale) assert.equal(await page.getByTestId(`mark-fresh-line-${n}`).getAttribute("data-fresh"), "stale");
  console.log(`${preset}: ${noun.one} ${n}: ${await row.innerText()}${stale ? "" : " (none went stale within a minute)"}`);
  await page.getByTestId(`row-line-${n}`).click();
  const seen = page.getByTestId("text-line-seen");
  await seen.getByText(/As you saw it at \d+:\d\d · /).waitFor({ timeout: 15_000 });
  const before = await seen.innerText();
  const look = page.getByTestId("button-look-line");
  assert.match(await look.innerText(), /^Look now \([\d.]+ energy\)$/, "a look shows its price");
  await look.click();
  await look.getByText(/Press again/).waitFor();
  await look.click();
  const until = Date.now() + 15_000;
  for (;;) {
    const t = await seen.innerText();
    if ((/up to date/.test(t) && (stale || t !== before)) || (t !== before && /changed once since/.test(t))) { console.log(`${preset}: after a look: ${t}`); break; }
    if (Date.now() > until) throw new Error(`the look did not update the ${noun.one}: ${t}`);
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: path.join(shots, `paid-${preset}-look.png`) });
  // Keep them fresh: one press (and its summary page) summons a Watcher.
  if (await page.getByTestId("tab-objects").count()) await page.getByTestId("tab-objects").click({ position: { x: 6, y: 10 } });
  if (!await page.getByTestId("button-keep-fresh").isVisible()) await page.getByTestId("details-look-more").click();
  await page.getByTestId("button-keep-fresh").click();
  // The confirmation says what the Watcher costs (round 13: "It costs energy", no figure).
  assert.match(await page.getByTestId("button-keep-fresh-confirm").innerText(), /Summon a Watcher for [\d.]+ energy/);
  await page.getByTestId("button-keep-fresh-confirm-ok").click();
  await page.getByTestId("text-watching").waitFor({ timeout: 30_000 });
  console.log(`${preset}: a Watcher keeps the ${noun.many} fresh`);
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.getByTestId("button-jump-objects").count()) await page.getByTestId("button-jump-objects").click();
  await page.locator("[data-testid^=text-seen-line-]").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.screenshot({ path: path.join(shots, `paid-${preset}-phone.png`) });
  assert.deepEqual(errors, [], "no page errors");
  await context.close();
}

const browser = await chromium.launch();
try {
  await paidGame(browser, "lines-beginner", { one: "line", many: "lines" });
  await paidGame(browser, "grids-beginner", { one: "grid", many: "grids" });
} finally {
  await browser.close();
}
console.log("ok - every game pays to look: as last seen with a mark, priced looks, look at all, a Watcher keeps them fresh (lines and grids)");
