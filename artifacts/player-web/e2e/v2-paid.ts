/**
 * Paid looks (v1's paid observation, W3 #643), in the app against the LIVE local engine: a room set to "players pay to
 * look"; in its practice game each line shows when you last saw it and how often it has changed since, and a look
 * (paid from your store) shows it as it is now.
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
async function setUp(page: Page, code: string, overrides: Record<string, unknown>) {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  const { roomId } = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  for (const args of [{ overrides }]) {
    const out = await client.mutation("v2/ops/room:settings" as never, { args, roomId } as never) as { ok: boolean; error?: { message: string } };
    assert.ok(out.ok, `room.settings: ${out.error?.message}`);
  }
}


const browser = await chromium.launch();
try {
  const { context, page, errors } = await signIn(browser, "alice");
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  const code = page.url().split("/").at(-1)!;
  await setUp(page, code, { planningSeconds: 5, worldSeconds: 120, observation: "paid" });
  await page.getByTestId("text-next-game-summary").getByText(/players pay to look at the world/).waitFor({ timeout: 15_000 });
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
  await page.getByTestId("button-summon-first").click();
  await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
  const startNow = page.getByTestId("button-start-world");
  if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
  await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });
  if (await page.getByTestId("tab-objects").count()) await page.getByTestId("tab-objects").click({ position: { x: 6, y: 10 } });
  // Each row says when you last saw it; the list offers one look at everything.
  await page.locator("[data-testid^=text-seen-line-]").first().waitFor({ timeout: 30_000 });
  await page.getByTestId("button-look-all").waitFor();
  // A line the practice partners changed since you saw it.
  const changed = page.locator("[data-testid^=text-seen-line-]", { hasText: /changed \d+×/ }).first();
  await changed.waitFor({ timeout: 60_000 });
  const n = (await changed.getAttribute("data-testid"))!.slice("text-seen-line-".length);
  console.log(`line ${n}: ${await changed.innerText()}`);
  await page.getByTestId(`row-line-${n}`).click();
  const seen = page.getByTestId("text-line-seen");
  await seen.getByText(/As you saw it at \d+:\d\d · changed (once|twice|\d+ times) since/).waitFor({ timeout: 15_000 });
  // A look pays to see it as it is now (the button asks once more first).
  const before = await seen.innerText();
  const look = page.getByTestId("button-look-line");
  await look.click();
  await look.getByText(/Press again/).waitFor();
  await look.click();
  const after = await seen.innerText().then(async () => {
    const until = Date.now() + 15_000;
    for (;;) {
      const t = await seen.innerText();
      // Seen now: nothing has changed since (or one change landed in the moment after the look, seen at a later time).
      if (/unchanged since/.test(t) || (t !== before && /changed once since/.test(t))) return t;
      if (Date.now() > until) throw new Error(`the look did not update the line: ${t}; toasts: ${(await page.locator("[data-state=open]").allInnerTexts()).join(" | ")}`);
      await page.waitForTimeout(200);
    }
  });
  console.log(`line ${n} after a look: ${after}`);
  await page.screenshot({ path: path.join(shots, "paid-look.png") });
  assert.deepEqual(errors, [], "no page errors");
  await context.close();
} finally {
  await browser.close();
}
console.log("ok - a paid game shows each line as last seen, how often it changed since, and a look shows it as it is now");
