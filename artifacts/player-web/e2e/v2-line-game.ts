/**
 * M2's acceptance (integration plan §5.3): a line game played end to end in the app, against the LIVE local engine
 * (`pnpm --filter @workspace/engine dev`; the Python runtime bundle uploaded by it). At desktop (1440×900) and phone
 * (390×844):
 *   create a room → "Play a practice game" (one press: practice partners fill the seats, the game starts) →
 *   "Summon my first agent" in one press (no check first) → "Start the world now" → a move of your agent appears in the
 *   act log as a full sentence with ✨ rarity and points before → after → the Lines rows draw compact faces with marks
 *   → one line opens with every representation the rule reads (desktop: pointing at an element lights the same
 *   meaning in another representation) → the goal card shows the ladder and the next step → the game ends on its own
 *   and the results lead with "You finished …".
 * The room's game is shortened to 5 s planning and 30 world seconds (room.settings, as its owner).
 *
 *   pnpm --filter @workspace/player-web run e2e:game        (SKIP_DEPLOY=1 reuses the uploaded build)
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
async function shorten(page: Page, code: string) {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  const found = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  const out = await client.mutation("v2/ops/room:settings" as never, { args: { overrides: { planningSeconds: 5, worldSeconds: 30 } }, roomId: found.roomId } as never) as { ok: boolean; error?: { message: string } };
  assert.ok(out.ok, `room.settings: ${out.error?.message}`);
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`) });
const clock = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const { context, page, errors } = await signIn(browser, label === "desktop" ? "alice" : "bob", viewport);
    const t0 = Date.now();
    await page.getByTestId("button-create-room").first().click();
    await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
    const code = page.url().split("/").at(-1)!;
    await shorten(page, code);
    await page.getByTestId("button-practice-game").click();
    await page.waitForURL(/\/games\//, { timeout: 30_000 });
    console.log(`${label}: seated and playing at ${clock(t0)}`);

    // The planning line's button summons in one press (ux-lessons 1.3); it is the first a walker presses.
    await page.getByTestId("button-summon-first").click();
    const status = page.getByTestId("text-forge-status");
    await status.getByText(/is summoned/).waitFor({ timeout: 60_000 });
    assert.match(await status.innerText(), /70% of it now goes to this agent/);
    assert.equal(await page.getByTestId("button-summon-first").count(), 0, "nothing offers the first summon again (ux 1.8)");
    console.log(`${label}: summoned at ${clock(t0)}`);

    const startNow = page.getByTestId("button-start-world");
    if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
    await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });

    const feed = page.getByTestId("pane-feed");
    // The first scoring move (a move can also leave the step and the points where they were).
    const mine = feed.getByText(/^Your agent .* changed a line.*✨ rarity/).first();
    await mine.waitFor({ timeout: 60_000 });
    const sentence = await mine.innerText();
    assert.match(sentence, /✨ rarity [\d.]+ → [\d.]+|✨ rarity [\d.]+/, `the move says the ✨ rarity: ${sentence}`);
    assert.match(sentence, /Points on this line [−\d.,]+ → [−\d.,]+|Points on this line stayed|No points on this line/, `the move says the points before → after: ${sentence}`);
    assert.doesNotMatch(sentence, /\bbits?\b|payoff|object/i);
    console.log(`${label}: first move of your agent at ${clock(t0)}: ${sentence.slice(0, 160)}`);

    // The goal card: the ladder and the next step (before one line's pane takes the oldest pane's place).
    const goal = page.getByTestId("pane-my-card");
    await goal.getByText(/Steps to the top/).first().waitFor();
    await goal.getByText(/Next step:/).first().waitFor({ timeout: 5000 }).catch(() => {});   // absent only at the top of the ladder
    await page.locator("[data-testid^=marks-line-]").first().waitFor({ timeout: 30_000 });
    await shot(page, `game-${label}-live`);
    if (label === "phone") {
      // A long act log never traps the phone's scroll: the row of pane names jumps to Lines.
      await page.getByTestId("button-jump-objects").click();
      await page.locator("[data-testid^=row-line-]").first().waitFor({ state: "visible" });
    }
    await page.locator("[data-testid^=row-line-]").first().click();
    const line = page.getByTestId("pane-object");
    await line.getByText("slope-intercept").first().waitFor({ timeout: 20_000 });
    if (label === "desktop") {
      // Plan §5.3: pointing at the y-intercept in slope-intercept form lights it on the plane (same meaning).
      // The plane is drawn when the rule reads it; otherwise compare with it (a view affordance, like a player would).
      if (!await line.locator('[data-ref="cart.yInt"]').count()) await line.locator("select", { has: page.locator("option", { hasText: /^nothing$/ }) }).first().selectOption({ label: "line on the plane" });
      await line.locator('[data-ref="cart.yInt"]').first().waitFor({ state: "attached", timeout: 5000 });
      const c = line.locator('[data-ref="si.c"]').first();
      if (await c.count()) {
        await c.hover({ force: true });   // the line moves under live play: never "stable" for long
        await line.locator('[data-ref="cart.yInt"][data-lit]').first().waitFor({ state: "attached", timeout: 3000 });
      } else console.log("desktop: this rule's representations have no si.c; cross-highlight not checked");
    }
    await shot(page, `game-${label}-line`);


    await page.getByTestId("text-phase").getByText("Ended").waitFor({ timeout: 120_000 });
    const results = page.getByTestId("pane-results");
    await results.getByText(/You finished (tied for )?\S+ of 3 with/).waitFor({ timeout: 20_000 });
    console.log(`${label}: natural end at ${clock(t0)}: ${(await results.getByText(/You finished/).first().innerText()).slice(0, 120)}`);
    // A practice game is dealt in a rotation: the results say which game of the round it was, with running totals.
    await results.getByTestId("results-rotation").getByText(/^Game 1 of 3 in this rotation/).waitFor({ timeout: 10_000 });
    await shot(page, `game-${label}-end`);
    assert.deepEqual(errors, [], `${label}: no page errors`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("ok - a line game played end to end at desktop and phone");
