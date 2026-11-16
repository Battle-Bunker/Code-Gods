/**
 * The old assistant-across-games scenario (archive/engine-v1 e2e/assistant-games.ts), ported to the v2 app: a
 * conversation with the in-client assistant (mock provider, `/mock`) in game 1; the owner ends it and starts game 2 from
 * the room page in the same document; the pane shows a fresh, empty assistant, and game 2's first message is answered in
 * a new conversation with nothing of game 1.
 *
 *   pnpm --filter @workspace/engine dev        (AI_MOCK=1, as dev.mjs sets it)
 *   pnpm --filter @workspace/player-web run e2e:v1-assistant-games          (SKIP_DEPLOY=1 reuses the build; ~1 min)
 *
 * v2 changed: practice partners fill the seats (v1: two mock AI seats); the assistant is a pane opened from a pane's
 * menu; the owner ends a game from the palette; the ended page leads back to the room with "Back to the room".
 */
import assert from "node:assert/strict";
import { DESKTOP, chromium, check, deploy, report, roomSettings, signIn, watch, type Page, type Player } from "./v1-harness.ts";

deploy();

const browser = await chromium.launch();
const everyone: Player[] = [];
try {
  const dana = await signIn(browser, "admin", { width: 1500, height: 1000 });   // AI spends only in rooms an administrator owns
  everyone.push(dana);
  const page = dana.page;
  watch(page);
  const pane = page.getByTestId("pane-assistant");

  async function showAssistant() {
    // The arrangement follows the person between games: wait for the dock to lay out before deciding to open the pane.
    await page.locator('[data-testid="dock-desktop"] [data-testid^="pane-"]').first().waitFor({ timeout: 60_000 });
    if (await pane.waitFor({ timeout: 3_000 }).then(() => true, () => false)) return;
    await page.locator("[data-testid^=button-pane-menu-]").first().click();
    await page.getByTestId("button-open-pane-assistant").click();
    await pane.getByTestId("assistant").waitFor({ timeout: 20_000 });
  }
  async function say(text: string) {
    await pane.getByTestId("input-assistant").fill(`/mock ${JSON.stringify([{ text }])}`);
    await pane.getByTestId("button-assistant-send").click();
    await pane.getByTestId("row-assistant-reply").filter({ hasText: text }).waitFor({ timeout: 30_000 })
      .catch(async () => { throw new Error(`no answer "${text}"; the pane shows ${JSON.stringify((await pane.innerText()).slice(0, 300))}`); });
  }
  async function start(p: Page) {
    await p.getByTestId("button-start-game").click({ timeout: 30_000 });
    const ok = p.getByTestId("button-start-game-confirm-ok");
    if (await ok.waitFor({ timeout: 3_000 }).then(() => true, () => false)) await ok.click();
  }
  let code = "", game1 = "";

  await check("game 1: a conversation in the pane", async () => {
    await page.getByTestId("button-create-room").first().click();
    await page.waitForURL(/\/rooms\/[0-9A-Z]+$/);
    code = (await page.getByTestId("text-room-code").innerText()).trim();
    await roomSettings(page, code, { planningSeconds: 600, worldSeconds: 600 });
    await page.getByTestId("button-practice-game").click();
    await page.waitForURL(/\/games\//, { timeout: 60_000 });
    game1 = page.url().replace(/[?#].*$/, "");
    // A reload would drop this marker (a same-document URL change would not).
    await page.evaluate(() => { (window as unknown as { __cgMarker: number }).__cgMarker = 42; });
    await showAssistant();
    await say("answer of game one");
    await say("second answer of game one");
  });
  const sameDocument = () => page.evaluate(() => (window as unknown as { __cgMarker?: number }).__cgMarker === 42);

  await check("game 2 starts in the same page: the pane shows an empty, fresh assistant without a reload", async () => {
    await page.keyboard.press("Control+K");
    await page.getByTestId("input-palette").fill("end the game");
    await page.getByTestId("row-palette-game.end").click();
    const confirm = page.locator('[data-testid="button-palette-modal-confirm"], [data-testid="button-palette-confirm"]').first();
    if (await confirm.waitFor({ timeout: 2_000 }).then(() => true, () => false)) await confirm.click();
    await page.getByTestId("text-phase").filter({ hasText: /ended/i }).waitFor({ timeout: 60_000 });
    await page.getByTestId("link-back-to-room").first().click();
    await page.waitForURL(new RegExp(`/rooms/${code}$`), { timeout: 30_000 });
    await start(page);
    await page.waitForURL((u: URL) => /\/games\//.test(u.pathname) && u.toString().replace(/[?#].*$/, "") !== game1, { timeout: 60_000 });
    await showAssistant();
    await page.waitForFunction(() => {
      const p = document.querySelector("[data-testid=pane-assistant]");
      return !!p && !p.textContent!.includes("answer of game one") && p.querySelectorAll("[data-testid=row-assistant-user]").length === 0;
    }, null, { timeout: 30_000 }).catch(async () => { throw new Error(`game 1's transcript stays: ${(await pane.innerText()).slice(0, 300)}`); });
    assert.equal(await pane.getByTestId("text-assistant-error").count(), 0, "an error is shown");
    assert.ok(await sameDocument(), "the page reloaded");
  });

  await check("game 2: the first message is answered in a new conversation, with nothing of game 1", async () => {
    await say("answer of game two");
    assert.ok(!(await pane.innerText()).includes("answer of game one"), "game 1's transcript is back");
    assert.equal(await pane.getByTestId("text-assistant-error").count(), 0, "an error");
    assert.equal(await pane.getByTestId("row-assistant-user").count(), 1, "one message in game 2's transcript");
    assert.ok(await sameDocument(), "the page reloaded");
  });

  await check("no uncaught page errors", () => assert.deepEqual(dana.errors, []));
} finally {
  await browser.close();
}
report(everyone);
