/**
 * M4's acceptance (integration plan §5.5): the same walk as v2-line-game.ts on a GRID game, with the noun "grid"
 * everywhere (ux-lessons 2.8), choosing "Grids · beginner" in the room's setup picker first. M2's original:
 * a line game played end to end in the app, against the LIVE local engine
 * (`pnpm --filter @workspace/engine dev`; the Python runtime bundle uploaded by it). At desktop (1440×900) and phone
 * (390×844):
 *   create a room → "Play a practice game" (one press: practice partners fill the seats, the game starts) →
 *   "Summon my first agent" in one press (no check first) → "Start the world now" → a move of your agent appears in the
 *   act log as a full sentence with your bits and points before → after (yours × others' = points) → "See it line by line" opens Lines by points → the Lines rows draw compact faces with marks
 *   → one line opens with every representation the rule reads (desktop: pointing at an element lights the same
 *   meaning in another representation) → the goal card shows the ladder and the next step → the game ends on its own
 *   and the results lead with "You finished …".
 * The room's game is shortened to 5 s planning and 30 world seconds (room.settings, as its owner).
 *
 *   pnpm --filter @workspace/player-web run e2e:grid-game   (SKIP_DEPLOY=1 reuses the uploaded build)
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
/** A line's score as every pane writes it (src/core/words.ts scoreFormula), 2 decimal places. */
const FORMULA = /your [\d,]+\.\d\d bits? × others' [\d,]+\.\d\d bits? [=≈] [\d,]+\.\d\d points?/;
const SCORE_SENTENCE = /You score on a (grid|line) when/;
const clock = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const { context, page, errors } = await signIn(browser, label === "desktop" ? "alice" : "bob", viewport);
    const t0 = Date.now();
    await page.getByTestId("button-create-room").first().click();
    await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
    const code = page.url().split("/").at(-1)!;
    await page.screenshot({ path: path.join(shots, `grid-${label}-room-before.png`), fullPage: true });
    // The owner picks the grid setup in the room (a radio in "Next game").
    const t1 = Date.now();
    await page.getByTestId("radio-setup-grids-beginner").click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="radio-setup-grids-beginner"]') as HTMLInputElement | null)?.checked === true, null, { timeout: 15_000 });
    console.log(`${label}: the grid setup chosen in ${clock(t1)}`);
    await page.getByTestId("text-next-game-summary").waitFor();
    await page.getByTestId("setup-grids-beginner").getByText(/grid of digits/).waitFor({ timeout: 10_000 });
    await shot(page, `grid-${label}-room`);
    await shorten(page, code);   // after the setup: choosing a setup resets the room's settings to its own
    await page.getByTestId("button-practice-game").click();
    await page.waitForURL(/\/games\//, { timeout: 30_000 });
    console.log(`${label}: seated and playing at ${clock(t0)}`);

    // "Where am I", before the first agent: how a score is made, in one sentence, and the step to the line-by-line list.
    const overview = page.getByTestId("pane-overview");
    await overview.getByText(SCORE_SENTENCE).first().waitFor({ timeout: 20_000 });
    const said = await overview.getByText(SCORE_SENTENCE).first().innerText();
    if (!/on a grid/.test(said)) console.log(`${label}: FINDING: the overview explains the score with "line": ${said.slice(0, 120)}`);
    await overview.getByTestId("button-line-by-line-overview").waitFor();
    if (label === "phone") await overview.screenshot({ path: path.join(shots, "grid-phone-where-am-i.png") });

    // The planning line's button summons in one press (ux-lessons 1.3); it is the first a walker presses.
    await page.getByTestId("button-summon-first").click();
    const status = page.getByTestId("text-forge-status");
    await status.getByText(/is summoned/).waitFor({ timeout: 60_000 });
    assert.match(await status.innerText(), /70% of it now goes to this agent/);
    assert.equal(await page.getByTestId("button-summon-first").count(), 0, "nothing offers the first summon again (ux 1.8)");
    console.log(`${label}: summoned at ${clock(t0)}`);
    if (label === "desktop") {
      // Editing the agent's code prices only the change (owner decision 21), beside the whole program's price.
      const box = page.getByTestId("input-forge-code");
      await box.fill((await box.inputValue()) + "\nconst extra = 1;\n");
      const priced = await page.getByTestId("text-forge-price").innerText();
      const m = /changes only: ([\d,.]+) ⚡ \(the whole program would be ([\d,.]+) ⚡\)/.exec(priced);
      assert.ok(m, `the edit is priced by its change: ${priced}`);
      assert.ok(Number(m[1]!.replace(/,/g, "")) < Number(m[2]!.replace(/,/g, "")), `the change costs less than the whole: ${priced}`);
      console.log(`${label}: ${priced}`);
      await box.fill(await box.inputValue().then(v => v.replace("\nconst extra = 1;\n", "")));
    }
    if (label === "phone") {
      // A phone folds the agent's code behind "Show the code" (a wall of code filled the screen in a persona walk).
      assert.equal(await page.getByTestId("input-forge-code").count(), 0, "phone: the code is folded");
      await page.getByTestId("button-forge-show-code").click();
      await page.getByTestId("input-forge-code").waitFor();
    }

    const startNow = page.getByTestId("button-start-world");
    if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
    await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });

    const feed = page.getByTestId("pane-feed");
    // The first scoring move (a move can also leave the step and the points where they were).
    // A move row of its own: a move folded into a tug-of-war entry is hidden inside its closed <details>.
    const mine = feed.locator("[data-testid=feed] > ol > li > [data-testid=text-move-line]").filter({ hasText: /^Your agent .* changed a grid.*Your rarity/ }).first();
    await mine.waitFor({ timeout: 60_000 }).catch(async (e: Error) => { await page.screenshot({ path: path.join(shots, `grid-${label}-no-move.png`) }); console.log(`${label}: feed says: ${(await feed.innerText()).slice(0, 600)}`); throw e; });
    const sentence = await mine.innerText();
    assert.match(sentence, /Your rarity [\d.,]+ → [\d.,]+ bits?/, `the move says your rarity in bits: ${sentence}`);
    assert.match(sentence, /Points on this grid [−\d.,]+ → [−\d.,]+|Points on this grid stayed|No points on this grid/, `the move says the points before → after: ${sentence}`);
    assert.match(sentence, FORMULA, `the move says yours × others' = points: ${sentence}`);
    assert.doesNotMatch(sentence, /payoff|object|✨/i);
    assert.doesNotMatch(sentence, /\d\.\d (bits?|points?|⚡)/, `every measure has 2 decimal places: ${sentence}`);
    console.log(`${label}: first move of your agent at ${clock(t0)}: ${sentence.slice(0, 160)}`);

    // The goal card: the ladder, each step's chance and the next step (before one line's pane takes the oldest pane's place).
    const goal = page.getByTestId("pane-my-card");
    await goal.getByText(/Steps to the top/).first().waitFor();
    await goal.getByText(/^1 in [\d.,]+( [a-z]+)? by chance$/).first().waitFor({ timeout: 10_000 });
    await goal.getByText(/Next step:/).first().waitFor({ timeout: 5000 }).catch(() => {});   // absent only at the top of the ladder
    if (label === "phone") {
      await goal.screenshot({ path: path.join(shots, "grid-phone-goal-card.png") });
      const ladder = goal.locator(".v2v-ladder").first();
      await ladder.scrollIntoViewIfNeeded();
      await ladder.screenshot({ path: path.join(shots, "grid-phone-goal-ladder.png") });
    }
    await page.locator("[data-testid^=marks-line-]").first().waitFor({ timeout: 30_000 });
    await shot(page, `grid-${label}-live`);

    if (label === "phone") {
      // A long act log never traps the phone's scroll: the row of pane names jumps to Lines.
      await page.getByTestId("button-jump-objects").click();
      await page.locator("[data-testid^=row-line-]").first().waitFor({ state: "visible" });
    }
    // From the total to the line-by-line list in one step (the header's button): Lines, sorted by your points.
    const sortSelect = page.getByTestId("select-lines-sort");
    if (await sortSelect.count()) await sortSelect.selectOption("recent");
    await page.getByTestId("button-line-by-line-bar").click();
    await page.getByTestId("pane-objects").waitFor();
    await page.locator("[data-testid^=row-line-]").first().waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await page.getByTestId("select-lines-sort").inputValue(), "points", "Lines sorted by your points");
    const why = page.locator("[data-testid^=text-why-line-]").first();
    assert.match(await why.innerText(), FORMULA, "a Lines row says yours × others' = points");
    if (label === "phone") await page.locator("[data-testid^=row-line-]").first().screenshot({ path: path.join(shots, "grid-phone-lines-row.png") });

    await page.locator("[data-testid^=row-line-]").first().click();
    const line = page.getByTestId("pane-object");
    await line.locator(".v2v-grid, [data-scene=grid]").first().waitFor({ state: "attached", timeout: 20_000 });
    assert.match(await line.getByTestId("text-line-formula").innerText(), FORMULA, "One line says yours × others' = points");
    // What a bit is, on tap (a phone has no hover).
    await line.getByTestId("button-bits-help-line").click();
    await page.getByTestId("text-bits-help").getByText(/Each bit = twice as rare\./).waitFor();
    await page.keyboard.press("Escape");
    await page.getByTestId("text-bits-help").waitFor({ state: "detached" });
    if (label === "phone") await line.screenshot({ path: path.join(shots, "grid-phone-one-line.png") });
    await shot(page, `grid-${label}-line`);


    await page.getByTestId("text-phase").getByText("Ended").waitFor({ timeout: 120_000 });
    const results = page.getByTestId("pane-results");
    await results.getByText(/You finished (tied for )?\S+ of 3 with/).waitFor({ timeout: 20_000 });
    // The results say what a total is, and step to the line-by-line list.
    const note = await results.getByTestId("text-results-note").innerText();
    if (!/points on every grid\./.test(note)) console.log(`${label}: FINDING: the results note does not say "grid": ${note.slice(0, 120)}`);
    await results.getByTestId("button-line-by-line-results").waitFor();
    console.log(`${label}: natural end at ${clock(t0)}: ${(await results.getByText(/You finished/).first().innerText()).slice(0, 120)}`);
    // A practice game is dealt in a rotation: the results say which game of the round it was, with running totals.
    await results.getByTestId("results-rotation").getByText(/^Game 1 of 3 in this rotation/).waitFor({ timeout: 10_000 });
    await shot(page, `grid-${label}-end`);
    assert.deepEqual(errors, [], `${label}: no page errors`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("ok - a grid game played end to end at desktop and phone");
