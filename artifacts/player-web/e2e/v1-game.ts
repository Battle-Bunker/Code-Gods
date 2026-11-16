/**
 * The old whole-game scenarios, ported to the v2 app: three humans in three browsers play one game through the UI
 * (archive/engine-v1 e2e/three-humans-walk.ts and multi-client.ts "full games"), then the game half of site-smoke.ts
 * (Starting… in the same frame, a bid phase, the spectating owner, the end from the owner's menu, past games).
 *
 *   pnpm --filter @workspace/engine dev
 *   pnpm --filter @workspace/player-web run e2e:v1-game          (SKIP_DEPLOY=1 reuses the uploaded build; ~6 min)
 *   ONLY=three or ONLY=bidding runs one of the two games.
 *
 * What v2 genuinely changed is noted where the check is; a scenario the app fails because the behaviour is missing is
 * `missing(...)` with its inventory rows (docs/engine-v2/v1-parity.json).
 *
 * Game 1 (desktop): alice creates a room, bob and carol open its link and join, alice starts; each summons the agent
 * the page offers; the world runs; every player sees their own agent's moves and score; public chat typed in one
 * browser reaches the others in the game; the owner ends it; every page turns into its replay on the same URL; the
 * replay leads back to the room, whose past games list it.
 * Game 2 (phone): the room is set to the bidding setup; alice watches, bob and carol and a practice partner play;
 * Start reads "Starting…" in the same frame; bob bids and takes it back, both pass; the spectating owner gets the
 * spectator view.
 */
import assert from "node:assert/strict";
import { DESKTOP, PHONE, SITE, chromium, check, deploy, missing, noHorizontalScroll, report, roomOp, roomSettings, shot, signIn, watch, type Page, type Player } from "./v1-harness.ts";

deploy();

const GAME_URL = /\/rooms\/[0-9A-Z]+\/games\/[^/?#]+$/;
const memberRow = (page: Page, name: RegExp) => page.locator('[data-testid^="row-member-"]', { hasText: name });
async function escapeAll(page: Page) { for (let i = 0; i < 3; i++) await page.keyboard.press("Escape"); }

/** Shows a dock pane: on a phone its tab, on a desktop the pane if it is open, else through a pane's menu. */
async function openPane(page: Page, id: string) {
  const tab = page.getByTestId(`tab-${id}`);
  if (await tab.count()) { await tab.first().click({ position: { x: 6, y: 10 } }); return page.getByTestId(`pane-${id}`); }
  const pane = page.getByTestId(`pane-${id}`);
  if (!await pane.count()) {
    await page.locator("[data-testid^=button-pane-menu-]").first().click();
    await page.getByTestId(`button-open-pane-${id}`).click();
  }
  await pane.waitFor();
  return pane;
}

/** Runs a palette command by its affordance id, confirming it when the palette asks. */
async function paletteRun(page: Page, query: string, id: string) {
  await page.keyboard.press("Control+K");
  await page.getByTestId("input-palette").fill(query);
  await page.getByTestId(`row-palette-${id}`).click({ timeout: 5_000 });
  const confirm = page.locator('[data-testid="button-palette-modal-confirm"], [data-testid="button-palette-confirm"]').first();
  if (await confirm.waitFor({ timeout: 2_000 }).then(() => true, () => false)) await confirm.click();
}

const browser = await chromium.launch();
const everyone: Player[] = [];
try {
  // ---------------------------------------------------------------- game 1: three humans, desktop
  if (!process.env.ONLY || process.env.ONLY === "three") {
    const alice = await signIn(browser, "alice", DESKTOP);
    const bob = await signIn(browser, "bob", DESKTOP);
    const carol = await signIn(browser, "carol", DESKTOP);
    const players = [alice, bob, carol];
    everyone.push(...players);
    const [a, b, c] = players.map(p => p.page) as [Page, Page, Page];
    watch(a, b, c);
    let code = "", gameUrl = "";

    await check("three humans: alice creates a room; bob and carol open its link and join; alice sees all three", async () => {
      await a.getByTestId("button-create-room").first().click();
      await a.waitForURL(/\/rooms\/[0-9A-Z]+$/);
      await a.getByTestId("button-copy-invite").waitFor();
      code = (await a.getByTestId("text-room-code").innerText()).trim();
      // The game must not end on its own while the checks run, and the planning must leave time to summon.
      await roomSettings(a, code, { planningSeconds: 120, worldSeconds: 600 });
      for (const p of [b, c]) {
        await p.goto(`${SITE}/rooms/${code}`);
        await p.getByTestId("button-join-room").click({ timeout: 30_000 });
      }
      await a.locator('[data-testid^="row-member-"]').nth(2).waitFor({ timeout: 30_000 });
      await a.getByTestId("button-start-game").waitFor();
    });

    await check("three humans: alice starts; every viewer of the room is taken to the game's page, in planning", async () => {
      // Marks each document: the room page must take everyone to the game without a reload.
      for (const p of players) await p.page.evaluate(() => { (window as unknown as { sameDoc: boolean }).sameDoc = true; });
      await missing(["e2e-site-smoke-8", "e2e-three-humans-walk-3"], "three humans: Start game starts in one click (v2 asks \"Start the game?\" first)", async () => {
        await a.getByTestId("button-start-game").click();
        await a.getByTestId("button-start-game-confirm").waitFor({ state: "detached", timeout: 1_500 });
        if (await a.getByTestId("button-start-game-confirm").count()) throw new Error("a confirmation dialog opened");
      }, async () => { if (await a.getByTestId("button-start-game-confirm-ok").count()) await a.getByTestId("button-start-game-confirm-ok").click(); });
      for (const p of players) await p.page.waitForURL(GAME_URL, { timeout: 120_000 });
      gameUrl = a.url();
      for (const p of players) {
        assert.equal(p.page.url(), gameUrl, `${p.who} is on the same game`);
        await p.page.getByTestId("text-phase").filter({ hasText: /plan/i }).waitFor({ timeout: 60_000 });
        assert.ok(await p.page.evaluate(() => (window as unknown as { sameDoc?: boolean }).sameDoc), `${p.who}'s page reloaded`);
      }
      await shot(a, "game1-planning-alice");
    });

    await check("three humans: each summons the agent the page offers (\"Summon my first agent\")", async () => {
      await Promise.all(players.map(async p => {
        await p.page.getByTestId("button-summon-first").click({ timeout: 60_000 });
        await p.page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 90_000 });
      }));
    });

    await check("three humans: a player edits the agent's code; the forge checks it and prices the change", async () => {
      if (!await b.getByTestId("input-forge-code").count()) await b.getByTestId("button-forge-show-code").click();
      const box = b.getByTestId("input-forge-code");
      const original = await box.inputValue();
      await box.fill(original + "\nconst extra = 1;\n");
      await b.getByTestId("text-forge-price").getByText(/changes only:/).waitFor({ timeout: 15_000 });
      await b.getByTestId("button-check").click();
      await b.getByTestId("text-check-report").waitFor({ timeout: 60_000 });
      assert.match(await b.getByTestId("text-check-report").innerText(), /\w/);
      await box.fill(original);
    });

    await check("three humans: the world starts and runs; each player sees their own agent's moves and their score", async () => {
      const startNow = a.getByTestId("button-start-world");
      if (await startNow.count()) await startNow.click();
      for (const p of players) await p.page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 60_000 });
      for (const p of players) {
        const feed = await openPane(p.page, "feed");
        await feed.getByTestId("text-move-line").filter({ hasText: /^Your agent/ }).first().waitFor({ state: "attached", timeout: 120_000 });
        assert.match(await p.page.getByTestId("text-my-total").innerText(), /points/);
      }
      await shot(b, "game1-running-bob");
    });

    await check("three humans: the objects (lines) list shows the board to each player", async () => {
      for (const p of players) {
        const lines = await openPane(p.page, "objects");
        await lines.locator("[data-testid^=row-object-], [data-testid^=row-line-]").first().waitFor({ timeout: 30_000 });
      }
    });

    await check("three humans: public chat typed in one browser reaches the others live, in the game", async () => {
      const text = "game round: hello from bob";
      const chat = await openPane(b, "public-chat");
      await chat.getByTestId("input-chat").fill(text);
      await chat.getByTestId("button-send-chat").click();
      for (const p of [a, c]) {
        const pane = await openPane(p, "public-chat");
        await pane.locator('[data-testid^="row-chat-"]', { hasText: text }).waitFor({ timeout: 20_000 });
      }
    });

    await missing(["page-game-owner-menu"], "three humans: the owner ends the game from the ⋯ owner menu (End game, confirm)", async () => {
      await a.getByTestId("button-owner-menu").click({ timeout: 3_000 });
      await a.getByTestId("button-end-game").click();
    }, () => escapeAll(a));

    await check("three humans: the owner ends the game (palette in v2); every page shows the ended game on the same URL", async () => {
      await paletteRun(a, "end the game", "game.end");
      for (const p of players) {
        await p.page.getByTestId("text-phase").filter({ hasText: /ended/i }).waitFor({ timeout: 90_000 });
        assert.equal(p.page.url().replace(/[?#].*$/, ""), gameUrl, `${p.who} left the game's page`);
      }
    });

    await missing(["e2e-multi-client-10", "e2e-site-smoke-11"], "three humans: the ended game's page turns into its replay by itself (the replay transport, no click)", async () => {
      // v2: the ended page leads with the results and a "Watch the replay" button; v1's page was the replay.
      await b.getByTestId("replay-bar").waitFor({ timeout: 10_000 });
    });

    await check("three humans: each reads the results (headline, exact totals, standings)", async () => {
      for (const p of players) {
        const results = p.page.getByTestId("results");
        await results.waitFor({ timeout: 60_000 }).catch(async () => { await openPane(p.page, "results"); });
        await p.page.getByTestId("text-results-headline").waitFor({ timeout: 30_000 });
        assert.match(await p.page.getByTestId("text-results-headline").innerText(), /\w/);
        assert.equal(await p.page.locator('[data-testid^="row-result-"]').count(), 3, `${p.who}: three players in the standings`);
      }
      await shot(a, "game1-results-alice");
      await noHorizontalScroll(a, "results");
    });

    await check("three humans: the replay's header leads back to the room page without a reload; its past games list the game", async () => {
      for (const p of players) {
        await p.page.evaluate(() => { (window as unknown as { sameDoc: boolean }).sameDoc = true; });
        await p.page.getByTestId("link-back-to-room").first().click();
        await p.page.waitForURL(new RegExp(`/rooms/${code}$`), { timeout: 30_000 });
        const gameId = gameUrl.split("/").at(-1)!;
        await p.page.getByTestId(`link-past-game-${gameId}`).waitFor({ timeout: 30_000 });
        assert.equal(await p.page.getByTestId(`link-past-game-${gameId}`).getAttribute("href"), `/rooms/${code}/games/${gameId}`);
        assert.ok(await p.page.evaluate(() => (window as unknown as { sameDoc?: boolean }).sameDoc), `${p.who}'s page reloaded`);
      }
    });

    await check("three humans: the ended game reopens from the room's history, and its replay plays after a reload", async () => {
      const gameId = gameUrl.split("/").at(-1)!;
      await c.getByTestId(`link-past-game-${gameId}`).click();
      await c.waitForURL(GAME_URL);
      await c.reload();
      // v2: the replay opens from the ended page's "Watch the replay".
      if (!await c.getByTestId("replay-bar").count()) await c.getByTestId("button-watch-replay").first().click({ timeout: 30_000 });
      await c.getByTestId("replay-bar").waitFor({ timeout: 60_000 });
      await c.getByTestId("input-replay-seek").waitFor();
    });

    await check("three humans: an old-style game link (/games/:code) is not found (no legacy links)", async () => {
      const gameId = gameUrl.split("/").at(-1)!;
      await a.goto(`${SITE}/games/${gameId}`);
      await a.getByTestId("text-not-found").waitFor({ timeout: 5_000 });
    });

    for (const p of players) await p.context.close();
  }

  // ---------------------------------------------------------------- game 2: bidding, spectating owner, phone
  if (!process.env.ONLY || process.env.ONLY === "bidding") {
    const alice = await signIn(browser, "alice", PHONE);
    const bob = await signIn(browser, "bob", PHONE);
    const carol = await signIn(browser, "carol", PHONE);
    const players = [alice, bob, carol];
    everyone.push(...players);
    const [a, b, c] = players.map(p => p.page) as [Page, Page, Page];
    watch(a, b, c);
    let code = "";

    await check("bidding: alice puts her room on the bidding setup; bob and carol join; alice watches; a practice partner fills the third seat", async () => {
      await a.getByTestId("button-create-room").first().click();
      await a.waitForURL(/\/rooms\/[0-9A-Z]+$/);
      code = (await a.getByTestId("text-room-code").innerText()).trim();
      await a.locator('label[data-testid^="setup-"]', { hasText: /with bidding/ }).first().locator('input[type="radio"]').click();
      await a.locator('label[data-testid^="setup-"]:has(input:checked)', { hasText: /with bidding/ }).waitFor({ timeout: 15_000 });
      await roomSettings(a, code, { planningSeconds: 120, worldSeconds: 600 });
      for (const p of [b, c]) {
        await p.goto(`${SITE}/rooms/${code}`);
        await p.getByTestId("button-join-room").click({ timeout: 30_000 });
      }
      await a.locator('[data-testid^="row-member-"]').nth(2).waitFor({ timeout: 30_000 });
      await missing(["comp-room-members", "cmd-site-rooms-setSpectator"], "bidding: the owner chooses to watch the next game from the page (v1: her row's toggle; v2's palette row only says to use the controls on the screen)", async () => {
        await a.getByTestId("button-watch").click({ timeout: 3_000 });
      }, () => escapeAll(a));
      // So the scenario goes on: the same affordance through its operation, as the owner.
      if (!await a.locator('[data-testid^="text-member-seat-"]', { hasText: /owner · watching/ }).count()) await roomOp(a, code, "room:setSpectator", { spectator: true });
      await a.locator('[data-testid^="text-member-seat-"]', { hasText: /owner · watching/ }).waitFor({ timeout: 15_000 });
      await paletteRun(a, "practice partners", "seats.fillPracticePartners");
      await a.locator('[data-testid^="row-member-"]', { hasText: /practice partner/ }).first().waitFor({ timeout: 15_000 });
    });

    await check("bidding: alice starts the game; the Start button reads \"Starting…\" in the same frame and refuses a second click", async () => {
      await a.getByTestId("button-start-game").waitFor({ timeout: 15_000 });
      // v2 asks first: the frame is read after the confirmation's click.
      await a.getByTestId("button-start-game").click();
      await a.getByTestId("button-start-game-confirm-ok").waitFor();
      await a.evaluate(() => document.querySelector('[data-testid="button-start-game-confirm-ok"]')!.addEventListener("click", () => requestAnimationFrame(() => {
        const btn = document.querySelector('[data-testid="button-start-game"]');
        (window as unknown as { startFrame: unknown }).startFrame = { text: btn?.textContent, disabled: btn?.getAttribute("aria-disabled") ?? (btn as HTMLButtonElement | null)?.disabled?.toString() };
      }), { once: true }));
      await a.getByTestId("button-start-game-confirm-ok").click();
      await a.waitForFunction(() => (window as unknown as { startFrame?: unknown }).startFrame);
      assert.deepEqual(await a.evaluate(() => (window as unknown as { startFrame: unknown }).startFrame), { text: "Starting…", disabled: "true" });
    });
    await check("bidding: players bid or pass with one button; bob bids 10% on a rule and takes it back; the last pass ends the phase for everyone", async () => {
      for (const p of [b, c]) await p.getByTestId("panel-bidding").waitFor({ timeout: 60_000 });
      assert.match(await b.getByTestId("text-viewer-seat").innerText(), /^Bidding: bid for the rule you want, or pass\.$/);
      assert.match(await b.getByTestId("bidding-countdown").innerText(), /[0-2]:\d\d/);
      const family = (await b.locator('[data-testid^="bid-family-"]').first().getAttribute("data-testid"))!.replace("bid-family-", "");
      await b.getByTestId(`button-bid-${family}-10`).click();
      await b.getByTestId(`text-my-bid-${family}`).filter({ hasText: "10%" }).waitFor();
      await shot(b, "game2-bidding-bob");
      await missing(["e2e-site-smoke-9"], "bidding: the old words: title \"Bid for your rule\", the button reads \"Done bidding\" once a bid is placed, your bids listed", async () => {
        assert.equal(await b.getByTestId("text-bidding-title").innerText({ timeout: 3_000 }), "Bid for your rule");
        await b.getByTestId("button-bidding-done").filter({ hasText: /^Done bidding$/ }).waitFor({ timeout: 3_000 });
        assert.match(await b.getByTestId("text-your-bids").innerText({ timeout: 3_000 }), /10%/);
      });
      await missing(["e2e-site-smoke-9"], "bidding: the spectating owner watches the clock and may Cancel; she has nothing to bid on; no second Start", async () => {
        await a.getByTestId("panel-bidding").waitFor({ timeout: 5_000 });
        assert.equal(await a.locator('[data-testid^="bid-family-"]').count(), 0, "a spectator has nothing to bid on");
        assert.equal(await a.getByTestId("button-start-game").count(), 0, "no second start while the players bid");
        await a.getByTestId("bidding-countdown").waitFor({ timeout: 3_000 });
        await a.getByTestId("button-cancel-bidding").waitFor({ timeout: 3_000 });
      });
      await noHorizontalScroll(b, "phone bidding");
      await b.getByTestId(`button-withdraw-${family}`).click();
      await b.getByTestId(`text-my-bid-${family}`).waitFor({ state: "detached" });
      await b.getByTestId("button-bidding-done").click();
      await b.getByTestId("text-bidding-waiting").filter({ hasText: /done bidding/ }).waitFor();
      await missing(["e2e-site-smoke-9"], "bidding: after passing bob reads \"You passed. Waiting for 1 more player…\" and may Change", async () => {
        await b.getByText("You passed. Waiting for 1 more player…").waitFor({ timeout: 3_000 });
        await b.getByTestId("button-bidding-change").waitFor({ timeout: 2_000 });
      });
      await c.getByTestId("button-bidding-done").click();
      for (const p of [b, c]) await p.waitForURL(GAME_URL, { timeout: 120_000 });
    });

    await check("bidding: the spectating owner watches the clock and is taken to the game, with the spectator view", async () => {
      await a.waitForURL(GAME_URL, { timeout: 120_000 });
      await a.getByTestId("text-watching").waitFor({ timeout: 60_000 });
      assert.equal(await a.getByTestId("button-summon-first").count(), 0, "a spectator has nothing to summon");
      await shot(a, "game2-spectator-alice");
      await noHorizontalScroll(a, "phone spectator");
    });

    await missing(["e2e-site-smoke-10"], "spectator: live Game details shows the settings and timings, with the world clock moving (v2 shows who held which rule only after the end)", async () => {
      await a.getByTestId("text-world-t").waitFor({ timeout: 3_000 });
    });

    await check("spectator: the owner starts the world; the leaderboard lists every seated player (not the spectating owner)", async () => {
      const startNow = a.getByTestId("button-start-world");
      if (await startNow.count()) await startNow.click();
      await a.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 60_000 });
      const pane = await openPane(a, "race");
      await pane.waitFor();
      const text = await pane.innerText();
      assert.match(text, /Bob/);
      assert.match(text, /Carol/);
      assert.doesNotMatch(text, /Alice Liddell/);
    });

    for (const p of players) await p.context.close();
  }

  await check("no uncaught page errors", () => {
    assert.deepEqual(everyone.flatMap(p => p.errors.map(e => `${p.who}: ${e}`)), []);
  });
} finally {
  await browser.close();
}
report(everyone);
