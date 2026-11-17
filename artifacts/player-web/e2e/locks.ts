/**
 * Locks in the app (docs/engine-v2/locks.md; the owner, 16 November), against the LIVE local engine. With the room's
 * `locks` setting on: a practice game; One line on a line; a lock made from a ready-made predicate, checked against the
 * line before paying, listed with its program, its share line (all of it yours) and its history; What if warns that a
 * change breaking it costs energy to remove it; the lock's energy decays over world time; the lock drained; the same
 * change then breaks nothing. With the setting off: no lock UI anywhere.
 *
 *   pnpm --filter @workspace/engine dev
 *   pnpm --filter @workspace/player-web run e2e:locks          (SKIP_DEPLOY=1 reuses the uploaded build; ~2 min)
 *
 * Test ids: locks-ui.tsx, object-locks.tsx, lock-warning.tsx; LOCKS_SETTING overrides the setting's
 * key/value (default {"locks":true}).
 */
import assert from "node:assert/strict";
import { DESKTOP, chromium, check, deploy, report, roomSettings, shot, signIn, watch, type Page, type Player } from "./v1-harness.ts";

deploy();

const LOCKS_ON: Record<string, unknown> = process.env.LOCKS_SETTING ? JSON.parse(process.env.LOCKS_SETTING) : { locks: true };
const LOCKS_OFF: Record<string, unknown> = Object.fromEntries(Object.entries(LOCKS_ON).map(([k, v]) => [k, typeof v === "boolean" ? false : v === "on" ? "off" : 0]));

/** The overlay of line `n` (hovering or clicking its face in Lines), pinned open. */
async function lineDetail(page: Page, n: number) {
  const detail = page.getByTestId("object-hover-detail");
  if (await detail.count()) return detail;
  await (await openPane(page, "objects")).getByTestId(`marks-line-${n}`).click();
  await detail.waitFor();
  return detail;
}

async function openPane(page: Page, id: string) {
  const pane = page.getByTestId(`pane-${id}`);
  if (await page.getByTestId(`tab-${id}`).count()) await page.getByTestId(`tab-${id}`).click({ position: { x: 6, y: 10 } });
  else if (!await pane.count()) {
    await page.locator("[data-testid^=button-pane-menu-]").first().click();
    await page.getByTestId(`button-open-pane-${id}`).click();
  }
  await pane.waitFor();
  return pane;
}

/** A practice game with the given settings, running, with a first agent; returns the room code. */
async function game(page: Page, settings: Record<string, unknown>) {
  await page.goto(page.url().replace(/\/rooms\/.*$/, "/"));
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[0-9A-Z]+$/);
  const code = (await page.getByTestId("text-room-code").innerText()).trim();
  await roomSettings(page, code, { planningSeconds: 5, worldSeconds: 600, ...settings });
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 60_000 });
  if (await page.getByTestId("button-start-world").count()) await page.getByTestId("button-start-world").click().catch(() => {});
  await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 60_000 });
  return code;
}

const held = (text: string | null | undefined) => Number(/Holds ([\d,.]+)/.exec(text ?? "")?.[1]?.replace(/,/g, "") ?? NaN);
const energyOf = async (page: Page, n: number) => held(await page.getByTestId(`text-lock-energy-${n}`).innerText());

const browser = await chromium.launch();
const everyone: Player[] = [];
try {
  const me = await signIn(browser, "alice", DESKTOP);
  everyone.push(me);
  const page = me.page;
  watch(page);
  let line = 0;

  await check("setting on: One line on a line shows its locks section; a lock is made from a ready-made predicate, checked against the line before paying", async () => {
    await game(page, LOCKS_ON);
    const lines = await openPane(page, "objects");
    await lines.locator('[data-testid^="row-line-"]').first().waitFor({ timeout: 30_000 });
    const one = page.getByTestId("object-hover-detail");
    // The first line, of the first few, that some ready-made predicate holds on (each is checked on the line before paying).
    let meets = false;
    for (let r = 0; r < 6 && !meets; r++) {
      const row = (await openPane(page, "objects")).locator('[data-testid^="row-line-"]').nth(r);
      line = Number((await row.getAttribute("data-testid"))!.replace("row-line-", ""));
      await row.locator("[data-testid^=marks-line-]").click();
      await one.getByTestId("locks").waitFor({ timeout: 15_000 });
      await one.getByTestId("button-lock-open").click();
      await one.getByTestId("form-lock-create").waitFor();
      const starters = one.locator('[data-testid^="button-lock-starter-"]');
      for (let i = 0; i < await starters.count() && !meets; i++) {
        await starters.nth(i).click();
        await one.getByTestId("button-lock-check").click();
        const verdict = one.getByTestId("text-lock-check");
        await verdict.waitFor({ timeout: 30_000 });
        meets = (await verdict.getAttribute("data-meets")) === "true";
      }
    }
    assert.ok(meets, "some ready-made predicate holds on the line");
    await one.getByTestId("input-lock-opening").fill("20");
    await one.getByTestId("button-lock-create").click();
    await one.getByTestId("text-lock-made").waitFor({ timeout: 30_000 });
    await one.getByTestId("lock-1").waitFor();
    assert.match(await one.getByTestId("text-lock-words-1").innerText(), /\w/);
    // What a player can see of it for costly signalling: the program, what went in and how much of it was theirs, the history.
    assert.match(await one.getByTestId("text-lock-share-1").innerText(), /^20 energy went in, all of it yours\.$/);
    await one.getByTestId("lock-history-1").locator("summary").click();
    assert.match(await one.getByTestId("lock-history-1").innerText(), /made with 20\.00 \(you\)/);
    await shot(page, "locks-made");
  });

  await check("setting on: What if warns that a change breaking the lock costs energy to remove it, naming the lock", async () => {
    const whatIf = await openPane(page, "what-if");
    // Try the changes What if offers until one breaks the lock (a ready-made predicate reads the line's numbers).
    const choices = await whatIf.getByTestId("select-what-if-change").locator("option").evaluateAll((os: HTMLOptionElement[]) => os.map(o => o.value));
    let warned = "";
    for (const c of choices) {
      await whatIf.getByTestId("select-what-if-change").selectOption(c);
      if (!await whatIf.getByTestId("what-if-result").waitFor({ timeout: 3_000 }).then(() => true, () => false)) continue;
      await whatIf.getByTestId("button-what-if-locks").click();
      const answer = whatIf.getByTestId("text-what-if-lock");
      await answer.waitFor({ timeout: 30_000 });
      if (await answer.getAttribute("data-breaks")) { warned = await answer.innerText(); break; }
    }
    assert.match(warned, /^This change breaks the lock “.+”: removing it costs [\d,.]+ energy\./);
  });

  await check("setting on: the lock's energy decays over world time", async () => {
    const one = await lineDetail(page, line);
    const before = await energyOf(page, 1);
    await page.waitForFunction(([n, e]: [number, number]) => Number(/Holds ([\d,.]+)/.exec(document.querySelector(`[data-testid=text-lock-energy-${n}]`)?.textContent ?? "")?.[1]?.replace(/,/g, "") ?? NaN) < e, [1, before] as [number, number], { timeout: 60_000 });
    await one.getByTestId("lock-1").waitFor();
  });

  await check("setting on: draining the lock to nothing removes it; the same change then breaks nothing", async () => {
    const one = await lineDetail(page, line);
    await one.getByTestId("button-lock-energy-1").click();
    await one.getByTestId("button-lock-take-1").click();
    await one.getByTestId("input-lock-amount-1").fill(String(Math.ceil(await energyOf(page, 1)) + 1));
    await one.getByTestId("button-lock-fund-go-1").click();
    await one.getByTestId("lock-1").waitFor({ state: "detached", timeout: 30_000 });
    // With no lock left, What if offers no lock check.
    const whatIf = await openPane(page, "what-if");
    await whatIf.getByTestId("what-if-result").waitFor({ timeout: 15_000 });
    assert.equal(await whatIf.getByTestId("what-if-locks").count(), 0, "a drained lock still offers a check");
  });

  await check("setting off: no lock UI anywhere (One line, What if)", async () => {
    await game(page, LOCKS_OFF);
    const lines = await openPane(page, "objects");
    const row = lines.locator('[data-testid^="row-line-"]').first();
    await row.waitFor({ timeout: 30_000 });
    await row.locator("[data-testid^=marks-line-]").click();
    await page.getByTestId("object-hover-detail").waitFor();
    await page.waitForTimeout(2_000);
    await openPane(page, "what-if");
    for (const sel of ['[data-testid="locks"]', '[data-testid="button-lock-open"]', '[data-testid="what-if-locks"]']) {
      assert.equal(await page.locator(sel).count(), 0, `${sel} shows with locks off`);
    }
  });

  await check("no uncaught page errors", () => assert.deepEqual(me.errors, []));
} finally {
  await browser.close();
}
report(everyone);
