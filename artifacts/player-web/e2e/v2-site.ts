/**
 * The app on engine v2, in Chromium against the LIVE local engine (`pnpm --filter @workspace/engine dev`) with its v2
 * test fixtures (convex/v2/testing.ts): the build is uploaded to the engine's static hosting, so the browser talks to
 * the real site origin (Better Auth cookie, Convex JWTs, live queries, affordances), as deployed.
 *
 *   pnpm --filter @workspace/engine dev
 *   pnpm --filter @workspace/player-web run e2e:site          (SKIP_DEPLOY=1 reuses the uploaded build)
 *
 * At desktop (1440×900) and phone (390×844) widths:
 *  - home: the empty state offers Create room and Join with a code; Create room seats you and opens the room;
 *  - room: a lone owner is offered a practice game against practice partners (ux-lessons 1.1–1.2), never "not available";
 *  - configure: the palette opens the room's settings page; a change shows in Review, is checked, saved and reaches the room;
 *  - your setups: one saved, duplicated, applied to the room by name, and the copy deleted;
 *  - a seeded live line game: your points and energy in the game bar (ux 2.5); the default panes; Lines rows with a
 *    compact face; opening a line shows every representation the rule depends on, and the Lines pane stays;
 *    the act log speaks in points and bits (yours × others' = points), 2 decimal places; no horizontal page scroll;
 *  - a seeded planning game: the planning line counts down, and the owner sees "Start the world now".
 * Screenshots go to SHOTS_DIR (default e2e/shots, gitignored).
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const ENGINE = path.join(ROOT, "artifacts/engine");
const shots = process.env.SHOTS_DIR ?? path.join(import.meta.dirname, "shots");
mkdirSync(shots, { recursive: true });

const convexRun = (fn: string, args: unknown) => {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: ENGINE, encoding: "utf8", env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" } }).trim();
  return out ? JSON.parse(out) : null;
};

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
  const subject = await page.evaluate(async () => ((await (await fetch("/api/auth/get-session")).json()) as { user: { id: string } }).user.id);
  return { context, page, errors, subject };
}

async function noHorizontalScroll(page: Page, label: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `${label}: the page scrolls sideways (${sw}px in ${iw}px)`);
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`) });
const code = () => `E${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const me = await signIn(browser, label === "desktop" ? "alice" : "bob", viewport);
    const page = me.page;

    await check(`${label}: Create room seats you and offers a practice game`, async () => {
      await page.getByTestId("button-create-room").first().click();
      await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
      // Enter in "Room code" joins, as the button does (playtest round 5): back home, type the code, press Enter.
      const roomCode = page.url().split("/").at(-1)!;
      await page.goto(`${SITE}/`);
      await page.getByTestId("button-join-by-code").click();
      await page.getByTestId("input-join-code").fill(roomCode);
      await page.getByTestId("input-join-code").press("Enter");
      await page.waitForURL(new RegExp(`/rooms/${roomCode}$`), { timeout: 15_000 });
      const status = page.getByTestId("text-viewer-seat");
      await status.waitFor();
      assert.match(await status.innerText(), /A game needs three players\. Play a practice game against practice partners, or invite friends\./);
      await page.getByTestId("button-practice-game").waitFor();
      assert.doesNotMatch(await page.locator("body").innerText(), /not available/i);
      await noHorizontalScroll(page, `${label} room`);
      await shot(page, `v2-room-${label}`);
      // The palette runs an operation that asks for text (playtest round 1: Enter did nothing).
      const said = `hello from the palette ${label}`;
      await page.keyboard.press("Control+K");
      await page.getByTestId("input-palette").fill("Send a chat message");
      await page.keyboard.press("Enter");
      const field = page.getByTestId("input-palette-field");
      await field.waitFor();
      await field.fill(said);
      await field.press("Enter");
      await page.locator("[data-testid^=row-chat-]").getByText(said).first().waitFor({ timeout: 15_000 });
      await page.getByText("Message sent to the room's chat.").first().waitFor({ timeout: 5_000 });
    });

    await check(`${label}: the palette opens the configure page; a change shows in Review and reaches the room (v1 configure, site-smoke)`, async () => {
      const roomUrl = page.url();
      await page.keyboard.press("Control+K");
      await page.getByTestId("input-palette").fill("Change the room's settings");
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/configure$/, { timeout: 15_000 });
      await page.getByTestId("section-time").waitFor();
      for (const s of ["setup", "goals", "agents", "energy", "time", "players", "review"]) await page.getByTestId(`section-${s}`).waitFor();
      assert.match(await page.getByTestId("button-save-settings-reason").innerText(), /Nothing has changed yet/);
      await page.getByTestId("choice-planningSeconds-120").click();
      await page.getByTestId("more-agents").locator("summary").click();
      await page.getByTestId("switch-commitClause").click();
      await page.getByTestId("change-planningSeconds").waitFor();
      const review = await page.getByTestId("list-review-changes").innerText();
      assert.match(review, /Planning: 1 min → 2 min/);
      assert.match(review, /Conditional moves: off → offered/);
      // A number outside the server's range is explained, and Save says why it cannot run.
      await page.getByTestId("button-exact-planningSeconds").click();
      await page.getByTestId("input-planningSeconds").fill("0.05");
      await page.getByTestId("error-planningSeconds").getByText("Must be between 5 and 900 seconds.").waitFor();
      await page.getByTestId("input-planningSeconds").fill("2");
      await noHorizontalScroll(page, `${label} configure`);
      await shot(page, `v2-configure-${label}`);
      await page.getByTestId("button-save-settings").click();
      await page.getByTestId("button-save-settings-confirm-ok").click();
      await page.waitForURL(roomUrl, { timeout: 15_000 });
      await page.getByTestId("text-next-game-summary").getByText(/120 s to plan/).waitFor({ timeout: 15_000 });
      // A reload of the configure page starts from what the room holds now (no stale draft).
      await page.getByTestId("link-configure").click();
      await page.getByTestId("text-no-changes").waitFor({ timeout: 10_000 });
      assert.equal(await page.getByTestId("switch-commitClause").getAttribute("aria-checked"), "true");
      await page.goto(roomUrl);
    });

    await check(`${label}: your setups: save one, duplicate it, apply it to the room, delete the copy (v1 site-smoke 3)`, async () => {
      const roomUrl = page.url();
      await page.goto(`${roomUrl}/configure`);
      await page.getByTestId("group-your-setups").waitFor();
      const name = `Slow ${label}`;
      await page.getByTestId("choice-planningSeconds-300").click();
      await page.getByTestId("input-setup-name").fill(name);
      await page.getByTestId("button-save-setup").click();
      await page.getByTestId(`row-setup-${name}`).waitFor({ timeout: 15_000 });
      await page.getByTestId(`button-duplicate-setup-${name}`).click();
      await page.getByTestId(`row-setup-${name}'s copy`).waitFor({ timeout: 15_000 });
      // Apply the original: the page holds exactly it, so Save applies it by name.
      await page.getByTestId(`choice-setup-${name}`).click();
      await page.getByTestId("text-applies-setup").getByText(`Applies the setup “${name}”.`).waitFor();
      await page.getByTestId("button-save-settings").click();
      await page.getByTestId("button-save-settings-confirm-ok").click();
      await page.waitForURL(roomUrl, { timeout: 15_000 });
      await page.getByTestId("text-next-game-summary").getByText(/300 s to plan/).waitFor({ timeout: 15_000 });
      await page.goto(`${roomUrl}/configure`);
      await page.getByTestId("text-room-runs-setup").getByText(`runs the setup “${name}”`).waitFor({ timeout: 15_000 });
      // Delete the copy (press again to confirm); the original stays.
      await page.getByTestId(`button-delete-setup-${name}'s copy`).click();
      await page.getByTestId(`button-delete-setup-${name}'s copy`).click();
      await page.getByTestId(`row-setup-${name}'s copy`).waitFor({ state: "detached", timeout: 15_000 });
      await page.getByTestId(`row-setup-${name}`).waitFor();
      // Shared as in v1: the phone's player (bob) sees alice's setup from the desktop run, to use or copy, not delete.
      if (label === "phone") {
        const theirs = page.getByTestId("group-others-setups").getByTestId("row-setup-Slow desktop");
        // Everyone's setups by name: the engine suites' setups may fill the first pages.
        for (let i = 0; i < 30 && !await theirs.count(); i++) {
          const more = page.getByTestId("button-more-setups-others");
          if (await more.count()) await more.click(); else await page.waitForTimeout(500);
        }
        await theirs.waitFor({ timeout: 15_000 });
        await theirs.getByText("Duplicate and edit").waitFor();
        assert.equal(await theirs.getByText("Delete").count(), 0, "only its owner deletes a setup");
      }
      await noHorizontalScroll(page, `${label} your setups`);
      await shot(page, `v2-setups-${label}`);
      await page.goto(roomUrl);
    });

    await check(`${label}: a live line game shows your totals, the panes and the lines' faces`, async () => {
      const room = code();
      const g = convexRun("v2/testing:seedGame", { owner: me.subject, practice: 2, code: room });
      await page.goto(`${SITE}/rooms/${room}/games/${g.gameId}`);
      await page.getByTestId("text-my-total").getByText(/points/).waitFor();   // "…" until the standings arrive
      assert.match(await page.getByTestId("text-my-energy").innerText(), /^Energy [\d,]+\.\d\d/);
      for (const pane of ["objects", "my-card", "feed", "agents", "race"]) await page.getByTestId(`pane-${pane}`).waitFor();
      const row = page.locator("[data-testid^=row-line-]").first();
      await row.waitFor();
      await page.locator("[data-testid^=marks-line-]").first().waitFor();   // each row's face arrives with its own subscription
      await page.getByTestId("pane-feed").getByText(/Your agent\b/).first().waitFor();   // \b: not the folded table's "Your agents' move"
      const feed = await page.getByTestId("pane-feed").innerText();
      assert.match(feed, /Your agent/);
      assert.doesNotMatch(feed, /payoff|object|\p{Extended_Pictographic}/iu, "the act log speaks in player words");
      assert.match(feed, /your [\d.,]+ bits? × others' [\d.,]+ bits? [=≈] [\d.,]+ points?/, "the act log shows how a line scores");
      assert.doesNotMatch(feed, /\d\.\d (bits?|points?|energy)/, "every measure has 2 decimal places");
      // A label that says energy is followed by the number alone (coordinator, after the word sweep: "Energy 576.00 energy").
      const doubled = (await page.locator("body").innerText()).match(/\benergy:?\s+(about\s+)?−?[\d,]+(\.\d+)?\s+energy\b/gi);
      assert.equal(doubled, null, `${label}: the word energy doubled: ${doubled}`);
      await noHorizontalScroll(page, `${label} game`);
      await shot(page, `v2-game-${label}`);
      await row.click();
      await page.getByTestId("pane-object").waitFor();
      await page.getByTestId("pane-objects").waitFor({ timeout: 5000 });   // the list a line is opened from stays
      await page.getByTestId("pane-object").getByText("your rule's main view").first().waitFor();   // the rule's representations
      // Every control of the views fits the screen (round 11: "More views" ran past a 390 phone's right edge).
      const width = page.viewportSize()!.width;
      for (const pane of ["pane-object", "pane-my-card"]) {
        if (!await page.getByTestId(pane).count() && await page.getByTestId("button-jump-my-card").count()) await page.getByTestId("button-jump-my-card").click();
        if (!await page.getByTestId(pane).count()) { console.log(`${label}: ${pane} not on screen; not measured`); continue; }
        await page.getByTestId(pane).locator(".v2v-switcher").first().waitFor({ timeout: 10_000 }).catch(() => {});
        // The widest case: each view select set to its longest choice.
        for (const sel of await page.getByTestId(pane).locator(".v2v-switcher select").all()) {
          const longest = await sel.evaluate((el: HTMLSelectElement) => [...el.options].filter(o => o.value).sort((a, b) => b.text.length - a.text.length)[0]?.value ?? "");
          if (longest) await sel.selectOption(longest).catch(() => {});
        }
        await page.waitForTimeout(300);
        console.log(`${label}: ${pane}: ${await page.getByTestId(pane).locator(".v2v-switcher").count()} view switchers measured`);
        const over = await page.getByTestId(pane).locator(".v2v-switcher select, .v2v-switcher label").evaluateAll((els: Element[], w: number) =>
          els.map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.right > w + 0.5).map(r => Math.round(r.right)), width);
        assert.deepEqual(over, [], `${label}: ${pane}'s view controls end within the ${width}px screen`);
      }
      await shot(page, `v2-line-${label}`);
    });

    await check(`${label}: a game parked for idleness says so, and a press resumes it (account.touch, W3 #629)`, async () => {
      // A real game (the engine's loop parks it at its next commit; a seeded game has no loop).
      await page.goto(`${SITE}/`);
      await page.getByTestId("button-create-room").first().click();
      await page.getByTestId("button-practice-game").click();
      await page.waitForURL(/\/games\//, { timeout: 30_000 });
      await page.getByTestId("button-start-world").click({ timeout: 30_000 });
      await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 60_000 });
      convexRun("v2/testing:setActivity", { at: 0 });   // nobody acted for 30 minutes
      const timer = page.getByTestId("game-timer");
      await timer.getByText("nobody was here for 30 minutes: it resumes when you act").waitFor({ timeout: 30_000 });
      // The presses above were reported within the minute; a fresh page has reported nothing yet.
      await page.reload();
      await page.getByTestId("text-my-total").waitFor();
      assert.ok(await timer.getByText(/nobody was here/).count() > 0, "still parked: loading the page is not activity");
      await page.getByTestId("text-my-total").click();   // a real press
      await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 15_000 });
      assert.equal(await timer.getByText(/nobody was here/).count(), 0, "resumed");
    });

    if (label === "desktop") await check(`${label}: line turnover: lines arrive, the oldest retires with its points banked, and the end page and replay show it`, async () => {
      // A practice game with turnover on (room settings liveCap 2, a birth every 5 s), 40 world seconds, dilated 2×.
      await page.goto(`${SITE}/`);
      await page.getByTestId("button-create-room").first().click();
      await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
      const roomCode = page.url().split("/").at(-1)!;
      convexRun("v2/testing:setRoomOverrides", { code: roomCode, overrides: { planningSeconds: 5, worldSeconds: 40, liveCap: 2, birthSeconds: 5 }, timeScale: 2 });
      await page.getByTestId("button-practice-game").click();
      await page.waitForURL(/\/games\//, { timeout: 30_000 });
      await page.getByTestId("button-start-world").click({ timeout: 30_000 });
      await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 60_000 });
      const lines = page.getByTestId("pane-objects");
      assert.match(await lines.getByTestId("text-turnover-note").innerText(), /At most 2 lines are live\. A new line arrives every 5 s\. Once 2 are live, each new line retires the oldest: its points stay in your total\./);
      await lines.locator("[data-testid^=badge-new-line-]").first().waitFor({ timeout: 30_000 });   // a line arrived
      const retired = lines.getByTestId("retired-lines");
      await retired.locator("[data-testid^=text-retired-line-]").first().waitFor({ timeout: 30_000 });
      assert.match(await retired.innerText(), /retired at \d+:\d\d · about [\d.,−-]+ points? as you last saw it/);
      assert.ok(await lines.locator("[data-testid^=row-line-]").count() <= 2, "at most 2 live lines listed");
      await shot(page, `v2-turnover-${label}`);
      // The end page: the retired lines with what each banked.
      await page.getByTestId("button-watch-replay").waitFor({ timeout: 90_000 });   // the game has ended
      const end = page.getByTestId("results").getByTestId("retired-lines");
      await end.locator("[data-testid^=text-retired-line-]").first().waitFor({ timeout: 30_000 })
        .catch(async (e: unknown) => { await shot(page, `v2-turnover-end-failed-${label}`); throw e; });
      // Ended: the exact figure, called banked.
      assert.match(await end.innerText(), /retired at \d+:\d\d · banked [\d.,−-]+ points?/);
      const banked = await end.locator("[data-testid^=row-retired-]").count();
      assert.ok(banked >= 3, `${banked} retired lines on the end page`);
      await shot(page, `v2-turnover-end-${label}`);
      // The replay: at its end the same retired lines.
      await page.getByTestId("button-watch-replay").click();
      // The replay opens at the start, before anything retired; at its end, the same retired lines.
      await page.getByTestId("replay-bar").waitFor({ timeout: 60_000 });
      await page.getByTestId("button-replay-end").click();
      const replayRetired = page.getByTestId("pane-objects").getByTestId("retired-lines");
      await replayRetired.locator("[data-testid^=row-retired-]").first().waitFor({ timeout: 60_000 });
      assert.equal(await replayRetired.locator("[data-testid^=row-retired-]").count(), banked, "the replay's end shows the same retired lines");
    });

    await check(`${label}: the goal card's view controls stay inside the card (round 11: Grids · more rules, Uphill, at 390)`, async () => {
      const width = page.viewportSize()!.width;
      for (let i = 0; i < 2; i++) {   // two deals: the rules vary
        // A practice game on that setup, still planning (a seeded game only knows lines).
        await page.goto(`${SITE}/`);
        await page.getByTestId("button-create-room").first().click();
        await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
        await page.getByTestId("setup-grids-more-rules").click();
        await page.waitForFunction(() => (document.querySelector("[data-testid=radio-setup-grids-more-rules]") as HTMLInputElement | null)?.checked === true);
        await page.getByTestId("button-practice-game").click();
        await page.waitForURL(/\/games\//, { timeout: 30_000 });
        if (!await page.getByTestId("pane-my-card").count() && await page.getByTestId("button-jump-my-card").count()) await page.getByTestId("button-jump-my-card").click();
        const card = page.getByTestId("goal-card");
        // The views are in the worked example, folded since #901: open it.
        await card.locator("details.v2v-goal-example > summary").click();
        await card.locator(".v2v-switcher").first().waitFor({ timeout: 15_000 });
        const out = await card.evaluate((el: HTMLElement, w: number) => {
          const box = el.getBoundingClientRect(), right = Math.min(box.right, w);
          return [...el.querySelectorAll(".v2v-switcher select, .v2v-switcher label, .v2v-tab")].map(e => ({ t: (e.textContent ?? "").trim().slice(0, 20), r: e.getBoundingClientRect().right }))
            .filter(x => x.r > right + 0.5).map(x => `${x.t} ends at ${Math.round(x.r)} (card ${Math.round(right)})`);
        }, width);
        const rule = (await card.innerText()).split("\n")[0];
        assert.deepEqual(out, [], `${label}: deal ${i} (${rule}): every view control inside the goal card`);
        if (i === 0) await shot(page, `v2-goal-views-${label}`);
      }
    });

    await check(`${label}: "Explain a term" opens the glossary at the term, and it closes (it set the view and showed nothing)`, async () => {
      await page.goto(`${SITE}/`);
      await page.getByTestId("button-avatar").waitFor();
      await page.locator("body").click({ position: { x: 5, y: 300 } });
      await page.keyboard.press("Control+K");
      await page.getByTestId("input-palette").fill("Explain a term");
      await page.keyboard.press("Enter");
      const field = page.getByTestId("input-palette-field");
      if (await field.isVisible({ timeout: 3000 }).catch(() => false)) { await field.fill("points"); await field.press("Enter"); }
      const glossary = page.getByTestId("glossary");
      await glossary.waitFor({ timeout: 10_000 });
      assert.match(await glossary.innerText(), /Points|Glossary/);
      await page.keyboard.press("Escape");
      await glossary.waitFor({ state: "detached", timeout: 5000 });
    });

    await check(`${label}: planning shows one countdown and the owner's "Start the world now"`, async () => {
      const room = code();
      const g = convexRun("v2/testing:seedGame", { owner: me.subject, practice: 2, code: room, phase: "planning" });
      await page.goto(`${SITE}/rooms/${room}/games/${g.gameId}`);
      const line = page.getByTestId("planning-line");
      await line.waitFor();
      assert.match(await line.innerText(), /The world starts in \d+:\d\d/);
      await page.getByTestId("button-start-world").waitFor();
      assert.equal(await page.getByTestId("game-timer").count(), 0, "one countdown in planning");
      await shot(page, `v2-planning-${label}`);
    });

    assert.deepEqual(me.errors, [], `${label}: no page errors`);
    await me.context.close();
  }
} finally {
  await browser.close();
}
console.log(`${passed} checks passed`);
