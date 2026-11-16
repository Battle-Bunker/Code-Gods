/**
 * The old replay scenario (archive/engine-v1 e2e/replay-shot.ts), ported to the v2 app: a real game played to its end,
 * then its replay found as a player finds it (the room's past games), and the bar's behaviour: where it sits, the
 * marks, the drag, play at 4×, the steps and keys, the palette, the deep link, another player's view, the phone.
 *
 *   pnpm --filter @workspace/engine dev
 *   pnpm --filter @workspace/player-web run e2e:v1-replay          (SKIP_DEPLOY=1 reuses the uploaded build; ~3 min)
 *
 * v2 changed: the slider is input-replay-seek with data-applied/data-end on replay-bar (v1: input-replay-scrub,
 * replay-transport's data-cursor/data-events); the deep link is ?replay&t=<world seconds>&as=<member> (v1: ?e=<event>);
 * the ended page leads with the results and opens the replay from "Watch the replay".
 */
import assert from "node:assert/strict";
import { DESKTOP, PHONE, SITE, chromium, check, deploy, missing, noHorizontalScroll, report, roomSettings, shot, signIn, watch, type Page, type Player } from "./v1-harness.ts";

deploy();

const applied = async (page: Page) => Number(await page.getByTestId("replay-bar").getAttribute("data-applied"));
const endOf = async (page: Page) => Number(await page.getByTestId("replay-bar").getAttribute("data-end"));
const playing = async (page: Page) => (await page.getByTestId("replay-bar").getAttribute("data-playing")) === "true";
const frames = (page: Page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Opens the ended game's replay on its page (v2: from the results' "Watch the replay" when the bar is not up). */
async function openReplay(page: Page, url: string) {
  await page.goto(url);
  await page.locator('[data-testid="replay-bar"], [data-testid="button-watch-replay"]').first().waitFor({ timeout: 60_000 });
  if (!await page.getByTestId("replay-bar").count()) await page.getByTestId("button-watch-replay").first().click();
  await page.locator('[data-testid="replay-bar"][data-status="ready"]').waitFor({ timeout: 60_000 });
}

const browser = await chromium.launch();
const everyone: Player[] = [];
try {
  const me = await signIn(browser, "admin", DESKTOP);   // AI (the assistant) is only available in rooms an administrator owns
  everyone.push(me);
  const page = me.page;
  watch(page);
  let code = "", gameUrl = "";

  await check("a real practice game is played to its end (setup for the replay)", async () => {
    await page.getByTestId("button-create-room").first().click();
    await page.waitForURL(/\/rooms\/[0-9A-Z]+$/);
    code = (await page.getByTestId("text-room-code").innerText()).trim();
    await roomSettings(page, code, { planningSeconds: 5, worldSeconds: 40 });
    await page.getByTestId("button-practice-game").click();
    await page.waitForURL(/\/games\//, { timeout: 60_000 });
    gameUrl = page.url().replace(/[?#].*$/, "");
    await page.getByTestId("button-summon-first").click({ timeout: 60_000 });
    await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 90_000 });
    if (await page.getByTestId("button-start-world").count()) await page.getByTestId("button-start-world").click().catch(() => {});
    await page.getByTestId("text-phase").filter({ hasText: /ended/i }).waitFor({ timeout: 180_000 });
  });

  await check("from the room page after the game is over, its past games open the game's replay (no typed URL)", async () => {
    await page.getByTestId("link-back-to-room").first().click();
    await page.waitForURL(new RegExp(`/rooms/${code}$`));
    const gameId = gameUrl.split("/").at(-1)!;
    await page.getByTestId(`link-past-game-${gameId}`).waitFor({ timeout: 60_000 });
    assert.equal(await page.getByTestId("link-active-game").count(), 0, "the room has no active game");
    await page.getByTestId(`button-replay-${gameId}`).click();
    await page.waitForURL((url: URL) => url.toString().startsWith(gameUrl), { timeout: 30_000 });
    await page.locator('[data-testid="replay-bar"][data-status="ready"]').waitFor({ timeout: 60_000 });
    assert.equal(page.url().replace(/[?#].*$/, ""), gameUrl, "the replay is the game's page");
    assert.ok(await endOf(page) > 10, `a real game's log (${await endOf(page)} events)`);
  });

  await missing(["e2e-replay-shot"], "the replay bar sits at the bottom of the screen", async () => {
    const bar = (await page.getByTestId("replay-bar").boundingBox())!;
    assert.ok(Math.abs(bar.y + bar.height - DESKTOP.height) <= 2, `the replay bar sits at the bottom (${bar.y}+${bar.height})`);
  });

  await check("the scrub track is wide (over half the screen)", async () => {
    const track = (await page.getByTestId("input-replay-seek").boundingBox())!;
    assert.ok(track.width > 720, `the track is wide (${track.width})`);
  });

  await check("key moments are marked on the track (v2: lead changes and summons)", async () => {
    assert.ok(await page.locator('[data-testid^="replay-mark-"]').count() > 0, "key moments are marked");
  });

  await check("an ended game's replay opens at its end", async () => {
    await openReplay(page, gameUrl);
    assert.equal(await applied(page), await endOf(page), "it opens at the end");
  });

  await check("hovering the track names the moment (time · event)", async () => {
    const track = (await page.getByTestId("input-replay-seek").boundingBox())!;
    await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
    const tip = page.getByTestId("replay-scrub-tooltip");
    await tip.waitFor({ timeout: 3_000 });
    assert.match(await tip.innerText(), /\d+:\d\d · event \d+/);
  });

  await check("dragging the slider: the playhead rises with every step, and on release the game seeks there", async () => {
    await openReplay(page, gameUrl);
    const track = (await page.getByTestId("input-replay-seek").boundingBox())!;
    const y = track.y + track.height / 2;
    await page.mouse.move(track.x + track.width * 0.2, y);
    await page.mouse.down();
    const seen: number[] = [];
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(track.x + track.width * (0.2 + 0.03 * i), y);
      await frames(page);
      seen.push(Number(await page.getByTestId("input-replay-seek").inputValue()));
    }
    assert.ok(seen.every((w, i) => i === 0 || w >= seen[i - 1]!) && seen.at(-1)! > seen[0]!, `the playhead rises with every step of the drag: ${seen.join(", ")}`);
    await page.mouse.up();
    const end = await endOf(page);
    await page.waitForFunction((e: number) => { const n = Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")); return n > e * 0.35 && n < e * 0.65; }, end, { timeout: 10_000 });
    await shot(page, "replay-bar-middle");
  });

  await missing(["e2e-replay-shot"], "on release the URL keeps the playhead's time, and it follows the playhead (v2 writes it only into the copied link)", async () => {
    await page.waitForFunction(() => new URL(location.href).searchParams.has("t"), null, { timeout: 5_000 });
  });

  await check("play at 4×: the playhead moves on; pause stops it", async () => {
    const before = await applied(page);
    await page.getByTestId("select-replay-speed").selectOption("4");
    await page.getByTestId("button-replay-play").click();
    await page.waitForFunction((m: number) => Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")) > m + 1, before, { timeout: 15_000 });
    await page.getByTestId("button-replay-pause").click();
    await page.waitForFunction(() => !document.querySelector("[data-testid=replay-bar]")?.hasAttribute("data-playing"));
    assert.equal(await playing(page), false, "pause stops playback");
  });

  await check("step forward and back by one move; the keys step too; Home jumps to the start, the end button to the end", async () => {
    const at = await applied(page);
    await page.getByTestId("button-replay-forward").click();
    await page.waitForFunction((n: number) => Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")) > n, at);
    const fwd = await applied(page);
    await page.getByTestId("button-replay-back").click();
    await page.waitForFunction((n: number) => Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")) < n, fwd);
    // v2 steps by a move (v1: by an event), so from a move boundary forward then back then forward lands on the same event.
    await page.getByTestId("button-replay-forward").click();
    await page.waitForFunction((n: number) => Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")) === n, fwd, { timeout: 5_000 })
      .catch(async () => { throw new Error(`forward, back, forward: ${fwd} then ${await applied(page)}`); });
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction((n: number) => Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")) > n, at);
    await page.keyboard.press("Home");
    await page.waitForFunction(() => Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")) === 0);
    await page.getByTestId("button-replay-end").click();
    await page.waitForFunction(() => { const b = document.querySelector("[data-testid=replay-bar]"); return b?.getAttribute("data-applied") === b?.getAttribute("data-end"); });
  });

  await missing(["e2e-replay-shot"], "the palette jumps the replay to the start (v1: \"Replay: jump to the start\")", async () => {
    await page.keyboard.press("Control+K");
    await page.getByTestId("input-palette").fill("start");
    await page.locator('[data-testid^="row-palette-"]', { hasText: /start/i }).filter({ hasText: /replay/i }).first().click({ timeout: 3_000 });
    await page.waitForFunction(() => Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")) === 0, null, { timeout: 5_000 });
  }, async () => { for (let i = 0; i < 3; i++) await page.keyboard.press("Escape"); });

  await check("the palette plays the replay", async () => {
    await page.getByTestId("button-replay-start").click().catch(() => {});
    await page.waitForFunction(() => Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")) === 0, null, { timeout: 5_000 });
    await page.keyboard.press("Control+K");
    await page.getByTestId("input-palette").fill("play");
    await page.getByTestId("row-palette-replay.play").click();
    await page.waitForFunction(() => Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")) > 0, null, { timeout: 15_000 });
    if (await page.getByTestId("button-replay-pause").count()) await page.getByTestId("button-replay-pause").click();
  });

  await check("play at the end starts over", async () => {
    await page.getByTestId("button-replay-end").click();
    await page.waitForFunction(() => { const b = document.querySelector("[data-testid=replay-bar]"); return b?.getAttribute("data-applied") === b?.getAttribute("data-end"); });
    const end = await endOf(page);
    await page.getByTestId("select-replay-speed").selectOption("1");
    await page.getByTestId("button-replay-play").click();
    await page.waitForFunction((e: number) => Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")) < e, end, { timeout: 5_000 });
    if (await page.getByTestId("button-replay-pause").count()) await page.getByTestId("button-replay-pause").click();
  });

  let deep = "";
  await check("\"Copy a link to this moment\" reopens the same moment, as the same player", async () => {
    await page.getByTestId("button-replay-start").click();
    for (let i = 0; i < 6; i++) await page.getByTestId("button-replay-forward").click();
    const clock = await page.getByTestId("text-replay-clock").innerText();
    await page.getByTestId("button-replay-link").click();
    deep = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(deep, /[?&]replay(=|&|$)/);
    assert.match(deep, /[?&]t=\d+/);
    await page.goto(deep);
    await page.locator('[data-testid="replay-bar"][data-status="ready"]').waitFor({ timeout: 60_000 });
    assert.equal((await page.getByTestId("text-replay-clock").innerText()).split(" ")[0], clock.split(" ")[0], "the deep link reopens the same moment");
  });

  await missing(["e2e-replay-shot"], "a step onto a change animates its line on the board", async () => {
    await page.getByTestId("button-replay-start").click().catch(() => {});
    let animated = false;
    for (let i = 0; i < 200 && !animated && await page.getByTestId("button-replay-forward").isEnabled(); i++) {
      await page.getByTestId("button-replay-forward").click();
      animated = await page.locator('[data-testid^="row-line-"].replay-changed, [data-testid^="row-line-"][data-changed]').count() > 0;
    }
    assert.ok(animated, "a step onto a change animates its line");
  });

  await check("an agent's code opens from the replay's timeline, and Escape closes it", async () => {
    const list = page.getByTestId("replay-events");
    if (!(await list.evaluate((d: HTMLDetailsElement) => d.open))) await list.locator("summary").click();
    await page.locator('[data-testid^="button-replay-agent-"]').first().click({ timeout: 10_000 });
    const src = page.getByTestId("text-replay-agent-source");
    await src.waitFor({ timeout: 5_000 });
    assert.ok(((await src.textContent()) ?? "").trim().length > 0, "the program's source is shown");
    await page.keyboard.press("Escape");
    await src.waitFor({ state: "detached", timeout: 5_000 });
  });

  await check("another player's point of view: Watch as switches the replay to theirs", async () => {
    const select = page.getByTestId("select-replay-as");
    const options = await select.locator("option").evaluateAll((os: HTMLOptionElement[]) => os.map(o => o.value));
    assert.ok(options.length >= 3, `every player can be watched (${options.length})`);
    const other = options.find((o: string) => o !== "" && o !== (options[0] as string)) ?? options[1]!;
    await select.selectOption(other);
    await page.getByTestId("game-bar").filter({ hasText: /Practice partner|Ada Admin/ }).waitFor({ timeout: 10_000 });
    assert.equal(await select.inputValue(), other, "watching as the chosen player");
    await page.getByTestId("button-replay-start").click().catch(() => {});
    await page.getByTestId("select-replay-speed").selectOption("4");
    await page.getByTestId("button-replay-play").click();
    await page.waitForFunction(() => Number(document.querySelector("[data-testid=replay-bar]")?.getAttribute("data-applied")) > 0, null, { timeout: 15_000 });
    if (await page.getByTestId("button-replay-pause").count()) await page.getByTestId("button-replay-pause").click();
  });

  await check("phone: the replay's play button is not covered; no sideways scroll", async () => {
    const phone = await signIn(browser, "admin", PHONE);
    everyone.push(phone);
    watch(phone.page);
    await openReplay(phone.page, deep || gameUrl);
    const play = (await phone.page.getByTestId("button-replay-play").boundingBox())!;
    assert.equal(await phone.page.evaluate(([x, y]: number[]) => document.elementFromPoint(x!, y!)?.closest("[data-testid=button-replay-play]") !== null, [play.x + play.width / 2, play.y + play.height / 2]), true, "play is not covered");
    await noHorizontalScroll(phone.page, "phone replay");
    await shot(phone.page, "replay-phone");
    await missing(["e2e-replay-shot"], "phone: the replay bar sits at the bottom of the screen", async () => {
      const bar = (await phone.page.getByTestId("replay-bar").boundingBox())!;
      assert.ok(Math.abs(bar.y + bar.height - PHONE.height) <= 2, `the phone's bar sits at the bottom (${bar.y}+${bar.height})`);
    });
  });

  await check("no uncaught page errors", () => assert.deepEqual(everyone.flatMap(p => p.errors.map(e => `${p.who}: ${e}`)), []));
} finally {
  await browser.close();
}
report(everyone);
