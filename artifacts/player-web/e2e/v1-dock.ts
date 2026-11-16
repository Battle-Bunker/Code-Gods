/**
 * The old dock and pane scenarios, ported to the v2 app (archive/engine-v1 e2e/multi-client.ts "the dock",
 * stored-panels.ts's pane checks, objects-scroll.ts): the default arrangement, the pane menu, the stored layout, the
 * assistant as an ordinary pane, moving panes, ?panels=off, and the objects (lines) list's paging and sort.
 * Stored-panel security (CSP, hostile panels) is in e2e/v1-panels.ts.
 *
 *   pnpm --filter @workspace/engine dev
 *   pnpm --filter @workspace/player-web run e2e:v1-dock          (SKIP_DEPLOY=1 reuses the uploaded build; ~2 min)
 *
 * A seeded live line game (convex/v2/testing.ts seedGame: the viewer, an administrator, and two practice partners) at 1440×900. v2
 * changed the panes' names (lines, not objects; the forge is Agent code) and their ids are `pane-<id>`.
 */
import assert from "node:assert/strict";
import { DESKTOP, SITE, chromium, check, convexRun, deploy, missing, report, shot, signIn, watch, type Page, type Player } from "./v1-harness.ts";

deploy();

const code = () => `D${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const openPanes = (page: Page) => page.locator('[data-testid="dock-desktop"] [data-testid^="pane-"]').evaluateAll((els: Element[]) =>
  els.map(e => e.getAttribute("data-testid")!.slice("pane-".length)).filter(id => !/^(menu|error)/.test(id)).sort());
async function escapeAll(page: Page) { for (let i = 0; i < 3; i++) await page.keyboard.press("Escape"); }

const browser = await chromium.launch();
const everyone: Player[] = [];
try {
  const me = await signIn(browser, "admin", DESKTOP);   // AI (the assistant) is only available in rooms an administrator owns
  everyone.push(me);
  const page = me.page;
  watch(page);
  const room = code();
  const g = convexRun("v2/testing:seedGame", { owner: me.subject, practice: 2, code: room, objects: 200 });
  const gameUrl = `${SITE}/rooms/${room}/games/${g.gameId}`;
  await page.goto(gameUrl);
  await page.getByTestId("dock-desktop").waitFor({ timeout: 60_000 });
  let defaults: string[] = [];

  await missing(["e2e-multi-client-3"], "the dock: the default arrangement includes the assistant (v1: goal | objects over assistant | agents | race)", async () => {
    await page.getByTestId("pane-assistant").waitFor({ timeout: 5_000 });
  });

  await check("the dock: a default arrangement of several panes, no tabs; a pane's menu opens another pane in its place", async () => {
    await page.locator('[data-testid^="pane-"]').first().waitFor({ timeout: 30_000 });
    defaults = await openPanes(page);
    assert.equal(await page.locator('[data-testid^="tab-"]').count(), defaults.length, `no tab groups by default: ${defaults.join(", ")}`);
    assert.ok(defaults.length >= 4, `several panes by default: ${defaults.join(", ")}`);
    const first = defaults.find(id => id !== "assistant")!;
    await page.getByTestId(`button-pane-menu-${first}`).click();
    const other = page.locator('[data-testid^="button-open-pane-"]').first();
    const id = (await other.getAttribute("data-testid"))!.replace("button-open-pane-", "");
    await other.click();
    await page.getByTestId(`pane-${id}`).waitFor();
    await shot(page, "dock-menu-opened");
  });

  await check("the dock: the arrangement is stored and comes back after a reload; a closed pane stays closed", async () => {
    const before = await openPanes(page);
    const closing = before.find(id => id !== "assistant")!;
    await page.getByTestId(`button-pane-menu-${closing}`).click();
    await page.getByTestId(`button-close-pane-${closing}`).click();
    await page.getByTestId(`pane-${closing}`).waitFor({ state: "detached" });
    await page.waitForTimeout(1_500);
    await page.reload();
    await page.getByTestId("dock-desktop").waitFor({ timeout: 60_000 });
    await page.locator('[data-testid^="pane-"]').first().waitFor();
    const after = await openPanes(page);
    assert.ok(!after.includes(closing), `the closed pane ${closing} came back: ${after.join(", ")}`);
  });

  await check("the assistant is an ordinary pane: close it, and the palette's \"Open the assistant\" brings it back", async () => {
    if (!await page.getByTestId("pane-assistant").count()) {
      await page.locator("[data-testid^=button-pane-menu-]").first().click();
      await page.getByTestId("button-open-pane-assistant").click();
      await page.getByTestId("pane-assistant").waitFor();
    }
    await page.getByTestId("button-pane-menu-assistant").click();
    await page.getByTestId("button-close-pane-assistant").click();
    await page.getByTestId("pane-assistant").waitFor({ state: "detached" });
    await page.keyboard.press("Control+K");
    await page.getByTestId("input-palette").fill("assistant");
    const row = page.locator('[data-testid^="row-palette-"]', { hasText: /assistant/i }).filter({ hasText: /open|show/i }).first();
    await row.click();
    await page.getByTestId("pane-assistant").waitFor({ timeout: 10_000 });
  });

  await check("a layout written by one client reaches the viewer's other open client live (no reload)", async () => {
    const second = await me.context.newPage();
    second.setDefaultTimeout(15_000);
    try {
      await second.goto(gameUrl);
      await second.getByTestId("dock-desktop").waitFor({ timeout: 60_000 });
      await second.locator('[data-testid^="pane-"]').first().waitFor();
      const target = (await openPanes(page)).find(id => id !== "assistant")!;
      await page.getByTestId(`button-pane-menu-${target}`).click();
      await page.getByTestId(`button-close-pane-${target}`).click();
      await second.getByTestId(`pane-${target}`).waitFor({ state: "detached", timeout: 10_000 });
    } finally { await second.close(); }
  });

  await missing(["e2e-stored-panels-6"], "the panel menu is a combobox: it opens focused, Esc closes it, typing \"chat\" then Enter switches the pane to Public chat", async () => {
    const pane = (await openPanes(page)).find(id => id !== "assistant" && id !== "public-chat")!;
    await page.getByTestId(`button-pane-menu-${pane}`).click();
    await page.keyboard.type("chat");
    await page.keyboard.press("Enter");
    await page.getByTestId("pane-public-chat").waitFor({ timeout: 3_000 });
  }, () => escapeAll(page));

  await check("the lines list pages itself: scrolling to its end loads the next page (\"N of M\" footer)", async () => {
    const lines = page.getByTestId("pane-objects");
    if (!await lines.count()) {
      await page.locator("[data-testid^=button-pane-menu-]").first().click();
      await page.getByTestId("button-open-pane-objects").click();
    }
    const footer = page.getByTestId("text-objects-footer");
    const said = await footer.innerText({ timeout: 5_000 });
    const m = said.match(/^(\d+) of (\d+)/);
    assert.ok(m, `the footer says how many of how many: "${said}"`);
    const [first, total] = m.slice(1).map(Number) as [number, number];
    assert.ok(total > first, `more lines than one page (${first} of ${total})`);
    await page.getByTestId("lines-list").first().evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForFunction((n: number) => Number(document.querySelector("[data-testid=text-objects-footer]")?.textContent?.match(/^(\d+) of/)?.[1]) > n, first, { timeout: 10_000 });
  });

  await check("the lines list's sort persists as the pane's parameter across a reload", async () => {
    if (await page.getByTestId("tab-objects").count()) await page.getByTestId("tab-objects").click({ position: { x: 6, y: 10 } });
    else if (!await page.getByTestId("pane-objects").count()) {
      await page.locator("[data-testid^=button-pane-menu-]").first().click();
      await page.getByTestId("button-open-pane-objects").click();
    }
    const select = page.getByTestId("select-lines-sort");
    await select.waitFor();
    const options = await select.locator("option").evaluateAll((os: HTMLOptionElement[]) => os.map(o => o.value));
    const current = await select.inputValue();
    const next = options.find((o: string) => o !== current)!;
    await select.selectOption(next);
    await page.waitForTimeout(1_500);
    await page.reload();
    await page.getByTestId("select-lines-sort").waitFor({ timeout: 60_000 });
    assert.equal(await page.getByTestId("select-lines-sort").inputValue(), next, "the sort survives a reload");
  });

  await missing(["e2e-stored-panels-4"], "dragging a pane onto the centre of another replaces it: no tabs, no ghost header left behind", async () => {
    const panes = (await openPanes(page)).filter(id => id !== "assistant");
    assert.ok(panes.length >= 2, "two panes to drag");
    const [from, onto] = panes as [string, string];
    const tab = page.getByTestId(`tab-${from}`);
    const target = await page.getByTestId(`pane-${onto}`).boundingBox();
    await tab.dragTo(page.getByTestId(`pane-${onto}`), { targetPosition: { x: target!.width / 2, y: target!.height / 2 } });
    await page.waitForTimeout(800);
    // Replaced, not stacked as tabs: the dragged pane's header is the only one where the target was, and every
    // header belongs to a pane on screen.
    assert.equal(await page.locator(`[data-testid="tab-${onto}"]`).count(), 0, `${onto} is still there (as a tab)`);
    assert.equal(await page.locator('[data-testid^="tab-"]').count(), (await openPanes(page)).length, "a header without its pane (a tab group or a ghost)");
  });

  await check("?panels=off loads only the built-in panes and the assistant (safe mode)", async () => {
    await page.goto(`${gameUrl}?panels=off`);
    await page.getByTestId("dock-desktop").waitFor({ timeout: 60_000 });
    await page.getByTestId("text-safe-mode").waitFor({ timeout: 5_000 });
  });

  await check("no uncaught page errors", () => assert.deepEqual(me.errors, []));
} finally {
  await browser.close();
}
report(everyone);
