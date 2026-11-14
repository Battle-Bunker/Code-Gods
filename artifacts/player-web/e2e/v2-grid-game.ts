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
 * With GRID_SETUP=grids-beginner-bidding the walk bids first: the practice game opens the bid phase, the walker bids
 * 10% on the first family offered and presses "Done bidding", and is dealt that family on the board.
 *
 *   pnpm --filter @workspace/player-web run e2e:grid-game   (SKIP_DEPLOY=1 reuses the uploaded build)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { assertNoLineWord, assertNoSteps } from "./no-steps.ts";
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

const SETUP = process.env.GRID_SETUP ?? "grids-beginner";
const BIDDING = SETUP.endsWith("-bidding");

/** The walker's dealt rule family in a game, through their own session. */
async function myFamily(page: Page, gameId: string): Promise<string> {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  return ((await client.query("v2/play:myRule" as never, { gameId } as never)) as { family: string }).family;
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
    await page.getByTestId(`radio-setup-${SETUP}`).click();
    await page.waitForFunction((id: string) => (document.querySelector(`[data-testid="radio-setup-${id}"]`) as HTMLInputElement | null)?.checked === true, SETUP, { timeout: 15_000 });
    console.log(`${label}: the grid setup chosen in ${clock(t1)}`);
    await page.getByTestId("text-next-game-summary").waitFor();
    await page.getByTestId(`setup-${SETUP}`).getByText(/grid of digits/).waitFor({ timeout: 10_000 });
    await shot(page, `grid-${label}-room`);
    await shorten(page, code);   // after the setup: choosing a setup resets the room's settings to its own
    await page.getByTestId("button-practice-game").click();
    let won: string | null = null;
    if (BIDDING) {
      // The bid phase: the families offered are the board's; bid on the first, then done.
      const panel = page.getByTestId("panel-bidding");
      await panel.waitFor({ timeout: 30_000 });
      const first = panel.locator('[data-testid^="bid-family-"]').first();
      won = (await first.getAttribute("data-testid"))!.replace("bid-family-", "");
      await shot(page, `grid-${label}-bidding`);
      await page.getByTestId(`button-bid-${won}-10`).click();
      await page.getByTestId(`text-my-bid-${won}`).waitFor({ timeout: 15_000 });
      await page.getByTestId("button-bidding-done").click();
      console.log(`${label}: bid 10% on ${won} at ${clock(t0)}`);
    }
    await page.waitForURL(/\/games\//, { timeout: 30_000 });
    console.log(`${label}: seated and playing at ${clock(t0)}`);
    if (won) {
      const family = await myFamily(page, page.url().split("/games/")[1]!.split(/[/?#]/)[0]!);
      assert.equal(family, won, "the walker is dealt the family they won");
    }

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
      // The price line follows the edit once the forge has re-rendered (reading it at once raced the render).
      await page.getByTestId("text-forge-price").getByText(/changes only:/).waitFor({ timeout: 10_000 });
      const priced = await page.getByTestId("text-forge-price").innerText();
      const m = /changes only: ([\d,.]+) ⚡ \(the whole program would be ([\d,.]+) ⚡\)/.exec(priced);
      assert.ok(m, `the edit is priced by its change: ${priced}`);
      assert.ok(Number(m[1]!.replace(/,/g, "")) < Number(m[2]!.replace(/,/g, "")), `the change costs less than the whole: ${priced}`);
      console.log(`${label}: ${priced}`);
      await box.fill(await box.inputValue().then(v => v.replace("\nconst extra = 1;\n", "")));
      // TARGET/SETTLE as a form (persona walk: "hold grid 12? don't know how"): numbers and a board, priced, then saved.
      const hold = page.getByTestId("hold");
      await hold.getByTestId("input-hold-numbers").fill("12");
      await hold.getByTestId("input-hold-board").fill("9779855879979779");
      await hold.getByTestId("text-hold").getByText(/will hold grid 12 at .* for [\d.]+ ⚡/).waitFor();
      await hold.getByTestId("button-hold").click();
      await hold.getByTestId("text-hold-done").getByText(/holds grid 12 at .*It cost [\d.]+ ⚡/).waitFor({ timeout: 30_000 });
      console.log(`${label}: ${(await hold.getByTestId("text-hold-done").innerText()).trim()}`);
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
    const mine = feed.locator("[data-testid=feed] > ol > li > div > [data-testid=text-move-line]").filter({ hasText: /^Your agent .* changed a grid.*Your rarity/ }).first();
    await mine.waitFor({ timeout: 60_000 }).catch(async (e: Error) => { await page.screenshot({ path: path.join(shots, `grid-${label}-no-move.png`) }); console.log(`${label}: feed says: ${(await feed.innerText()).slice(0, 600)}`); throw e; });
    const sentence = await mine.innerText();
    assert.match(sentence, /Your rarity ([\d.,]+ → [\d.,]+ bits?|stayed [\d.,]+ bits?)/, `the move says your rarity in bits: ${sentence}`);
    assert.match(sentence, /Points on this grid [−\d.,]+ → [−\d.,]+|Points on this grid stayed|No points on this grid/, `the move says the points before → after: ${sentence}`);
    assert.match(sentence, FORMULA, `the move says yours × others' = points: ${sentence}`);
    assert.doesNotMatch(sentence, /payoff|object|✨/i);
    assert.doesNotMatch(sentence, /\d\.\d (bits?|points?|⚡)/, `every measure has 2 decimal places: ${sentence}`);
    // The change is drawn as a small board beside the sentence, not written as sixteen digits (coordinator, round 6).
    assert.doesNotMatch(sentence, /\d \d \d \d \/ \d/, `no board written out in digits: ${sentence}`);
    await mine.locator("xpath=..").getByTestId("move-board").locator("svg").first().waitFor();
    await mine.locator("xpath=../..").screenshot({ path: path.join(shots, `grid-${label}-feed.png`) });
    console.log(`${label}: first move of your agent at ${clock(t0)}: ${sentence.slice(0, 160)}`);

    // The goal card (decision 23): a worked example and the rule's parts, no steps.
    const goal = page.getByTestId("pane-my-card");
    await goal.getByText(/A worked example/).first().waitFor();
    await goal.locator(".v2v-part").first().waitFor();
    assert.equal(await goal.getByText(/Steps to the top|step \d+ of \d+/).count(), 0, "no steps on the goal card");
    if (label === "phone") await goal.screenshot({ path: path.join(shots, "grid-phone-goal-card.png") });
    await page.locator("[data-testid^=marks-line-]").first().waitFor({ timeout: 30_000 });
    await assertNoSteps(page, `${label}: the live game`);
    await assertNoLineWord(page, `${label}: the live game`);
    await shot(page, `grid-${label}-live`);

    if (label === "phone") {
      // A long act log never traps the phone's scroll: the row of pane names jumps to Lines.
      await page.getByTestId("button-jump-objects").click();
      await page.locator("[data-testid^=row-line-]").first().waitFor({ state: "visible" });
    }
    // From the total to the line-by-line list in one step (the header's button): Lines, sorted by your points.
    const sortSelect = page.getByTestId("select-lines-sort");
    if (await sortSelect.count()) await sortSelect.selectOption("recent");
    // The game's own noun (playtest round 3, ux-lessons 2.8): "See it grid by grid".
    assert.equal((await page.getByTestId("button-line-by-line-bar").innerText()).trim(), "See it grid by grid");
    await page.getByTestId("button-line-by-line-bar").click();
    await page.getByTestId("pane-objects").waitFor();
    await page.locator("[data-testid^=row-line-]").first().waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await page.getByTestId("select-lines-sort").inputValue(), "points", "Lines sorted by your points");
    const why = page.locator("[data-testid^=text-why-line-]").first();
    assert.match(await why.innerText(), FORMULA, "a Lines row says yours × others' = points");
    if (label === "phone") await page.locator("[data-testid^=row-line-]").first().screenshot({ path: path.join(shots, "grid-phone-lines-row.png") });

    // One grid is read on the ended game: the 30 s world ends about now, and the change of phase remounts the panes
    // (opened just before it, its buttons detached under the click).
    await page.getByTestId("text-phase").getByText(/ended/i).waitFor({ timeout: 60_000 });
    await page.locator("[data-testid^=row-line-]").first().click();
    const line = page.getByTestId("pane-object");
    await line.locator(".v2v-grid, [data-scene=grid]").first().waitFor({ state: "attached", timeout: 20_000 });
    assert.match(await line.getByTestId("text-line-formula").innerText(), FORMULA, "One line says yours × others' = points");
    // What a bit is, on tap (a phone has no hover).
    await line.getByTestId("button-bits-help-line").click();
    await page.getByTestId("text-bits-help").getByText(/Each bit = twice as rare\./).waitFor();
    assert.doesNotMatch(await page.getByTestId("text-bits-help").innerText(), /\blines?\b/, "the bits help says grid, not line");
    // Closed as a phone closes it: a second tap on its button (Escape needs the focus inside the popover).
    await line.getByTestId("button-bits-help-line").click();
    await page.getByTestId("text-bits-help").waitFor({ state: "detached" });
    if (label === "phone") {
      // The representation tabs take one scrolling row, so the board comes right after them (round 3: nine wrapped chips).
      const tabs = await line.locator(".v2v-tabs").first().boundingBox();
      assert.ok(tabs && tabs.height < 48, `phone: the tabs are one row (${tabs?.height} px tall)`);
      await line.screenshot({ path: path.join(shots, "grid-phone-one-line.png") });
    }
    // The annotations chain on a grid (the persona walk's four questions; docs/engine-v2/annotations-design.md §11.4):
    // what the rule reads and how much (the main part and its units), where that is (a ruler), what would make the board
    // rarer at what price with its new bits, and the others' bits in the formula (checked above).
    const parts = line.locator(".v2v-part");
    await parts.first().waitFor({ timeout: 10_000 });
    const main = await parts.first().innerText();
    assert.match(main, /^● Main part: /m, `the main part is named with its glyph: ${main}`);
    assert.match(main, /off by \d|: \d|exactly/, `the main part says how much: ${main}`);
    assert.ok(await parts.first().locator(".v2v-ruler").count() > 0, "the main part sits on a ruler");
    const options = line.locator(".v2v-move-option");
    if (await options.count()) {
      // The price and new bits arrive after the move's words (read at once, the text was only "−1 in every cell of row 4").
      await options.first().getByText(/→ [\d,]+\.\d\d bits?/).waitFor({ timeout: 15_000 });
      const first = await options.first().innerText();
      assert.match(first, /[\d,]+\.\d\d ⚡/, `a move has its price: ${first}`);
      assert.match(first, /→ [\d,]+\.\d\d bits? \(1 in [\d,.]+( [a-z]+| × 10[⁰¹²³⁴⁵⁶⁷⁸⁹]+)? by chance\)/, `a move has its new bits: ${first}`);
    } else await line.getByText(/No single move makes this grid rarer/).waitFor();
    await line.locator(".v2v-exp-body").scrollIntoViewIfNeeded();
    await line.screenshot({ path: path.join(shots, `grid-${label}-parts.png`) });
    await shot(page, `grid-${label}-line`);


    await page.getByTestId("text-phase").getByText("Ended").waitFor({ timeout: 120_000 });
    const results = page.getByTestId("pane-results");
    // On a desktop the Grids pane, opened after the end, is in front of Results' tab ("How the game went").
    if (await page.getByTestId("tab-results").count()) await page.getByTestId("tab-results").click();
    await results.getByText(/You finished (tied for )?\S+ of 3 with/).waitFor({ timeout: 20_000 });
    await assertNoSteps(page, `${label}: the results`);
    // The end in plain words: what earned your points, what cost you, one thing to try next game.
    const summary = page.getByTestId("results-summary");
    await summary.getByTestId("text-summary-next").waitFor({ timeout: 20_000 });
    // The next step sits right under the headline: on a phone it is on screen with it (above the fold).
    const head = await page.getByTestId("text-results-headline").boundingBox(), next = await summary.getByTestId("text-summary-next").boundingBox();
    assert.ok(head && next && next.y - head.y < 260, `the next step is right under the headline (${head?.y} → ${next?.y})`);
    const summed = await summary.innerText();
    assert.match(summed, /What earned your points/i);
    assert.match(summed, /What cost you/);
    assert.match(summed, /(settle grid \d+ at|hold grid \d+ |pull the same grid back and forth|is the one the others want most|Open your secret goal)/, summed);
    await summary.screenshot({ path: path.join(shots, `grid-${label}-summary.png`) });
    await assertNoLineWord(page, `${label}: the results`);
    // The results say what a total is, and step to the line-by-line list.
    const note = await results.getByTestId("text-results-note").innerText();
    assert.match(note, /points on every grid\./, `${label}: the results note says grid`);
    await results.getByTestId("button-line-by-line-results").waitFor();
    console.log(`${label}: natural end at ${clock(t0)}: ${(await results.getByText(/You finished/).first().innerText()).slice(0, 120)}`);
    if (BIDDING) {
      // A won bid: the handicap is on the result, and the deal does not rotate (docs/bid-phase.md).
      assert.match(await results.getByText(/You finished/).first().innerText(), /after your bid's 10% handicap/);
      assert.equal(await results.getByTestId("results-rotation").count(), 0, "a deal with a won bid does not rotate");
    } else {
      // A practice game is dealt in a rotation: the results say which game of the round it was, with running totals.
      await results.getByTestId("results-rotation").getByText(/^Game 1 of 3: you get a different rule each game, and your totals add up over the 3 games\./).waitFor({ timeout: 10_000 });
    }
    await shot(page, `grid-${label}-end`);
    assert.deepEqual(errors, [], `${label}: no page errors`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("ok - a grid game played end to end at desktop and phone");
