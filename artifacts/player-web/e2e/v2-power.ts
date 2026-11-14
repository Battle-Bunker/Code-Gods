/**
 * "Pull power back to pay for this" (owner, 14 November) against the live local engine, at desktop and phone: a
 * practice game with a first agent; summon beside it until the own store cannot pay; the forge offers to pull power
 * back; one press lowers the agents to a sliver, the store fills, the summon is paid, and the proposed split including
 * the new agent is confirmed. A summon wanted must be paid within a minute.
 *
 *   pnpm --filter @workspace/player-web run e2e:power        (SKIP_DEPLOY=1 reuses the uploaded build)
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

async function signIn(browser: any, who: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
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

/** The room's next game, shortened, through its owner's own session (the room.settings affordance). */
async function shorten(page: Page, code: string, worldSeconds = 30) {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  const found = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  const out = await client.mutation("v2/ops/room:settings" as never, { args: { overrides: { planningSeconds: 5, worldSeconds } }, roomId: found.roomId } as never) as { ok: boolean; error?: { message: string } };
  assert.ok(out.ok, `room.settings: ${out.error?.message}`);
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`) });
/** A line's score as every pane writes it (src/core/words.ts scoreFormula), 2 decimal places. */
const FORMULA = /your [\d,]+\.\d\d bits? × others' [\d,]+\.\d\d bits? [=≈] [\d,]+\.\d\d points?/;
const SCORE_SENTENCE = "You score on a line when it's rare for you and rare for someone else at the same time: your rarity × theirs. Your total adds up all the lines.";
const clock = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const { context, page, errors } = await signIn(browser, label === "desktop" ? "alice" : "bob", viewport);
    const t0 = Date.now();
    await page.getByTestId("button-create-room").first().click();
    await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
    const code = page.url().split("/").at(-1)!;
    await shorten(page, code, 180);
    await page.getByTestId("button-practice-game").click();
    await page.waitForURL(/\/games\//, { timeout: 30_000 });
    await page.getByTestId("button-summon-first").click();
    await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
    const startNow = page.getByTestId("button-start-world");
    if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
    await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });
    if (label === "phone") await page.getByTestId("button-forge-show-code").click().catch(() => {});
    // Summon beside it until the own store cannot pay: then the forge offers the pull-back.
    const pull = page.getByTestId("button-pull-back");
    for (let i = 0; i < 4 && !(await pull.count()); i++) {
      await page.getByTestId("button-summon-beside").click();
      // Either it is paid ("Summoned for …"), or there is not enough energy and the pull-back is offered at once.
      await Promise.race([
        page.getByTestId("text-forge-status").getByText(/Summoned for/).waitFor({ timeout: 60_000 }),
        pull.waitFor({ timeout: 60_000 }),
      ]);
      await page.waitForTimeout(500);
    }
    await pull.waitFor({ timeout: 10_000 });
    const wanted = Date.now();
    console.log(`${label}: offered "${(await pull.innerText()).trim()}"`);
    await pull.click();
    await page.getByTestId("panel-pull-back").waitFor();
    const proposal = page.getByTestId("text-pull-back-proposal");
    await proposal.waitFor({ timeout: 90_000 });
    console.log(`${label}: paid ${clock(wanted)} after asking; ${(await proposal.innerText()).trim()}`);
    await page.getByTestId("button-pull-back-use").click();
    await page.getByTestId("text-pull-back-done").waitFor({ timeout: 15_000 });
    assert.ok(Date.now() - wanted < 60_000, `${label}: a summon wanted is paid within a minute`);
    assert.deepEqual(errors, [], `${label}: no page errors`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("ok - pulling power back pays for a summon, then the new split is confirmed, at desktop and phone");
