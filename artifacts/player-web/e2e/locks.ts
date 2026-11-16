/**
 * Locks in the app (docs/engine-v2/locks.md; the owner, 16 November), against the LIVE local engine. With the room's
 * `locks` setting on: a practice game; One line on a line; a lock made from a ready-made predicate, checked against the
 * line before paying; What if warns that a change breaking it costs energy to remove it; the lock drained; the same
 * change then passes; the lock's energy decays over world time; the Lines list marks the locked line. With the setting
 * off: no lock UI anywhere.
 *
 *   pnpm --filter @workspace/engine dev
 *   pnpm --filter @workspace/player-web run e2e:locks          (SKIP_DEPLOY=1 reuses the uploaded build; ~2 min)
 *
 * Test ids from the locks app session (locks-ui.tsx, object.tsx, what-if.tsx); LOCKS_SETTING overrides the setting's
 * key/value (default {"locks":true}).
 */
import assert from "node:assert/strict";
import { DESKTOP, chromium, check, deploy, report, roomSettings, shot, signIn, watch, type Page, type Player } from "./v1-harness.ts";

deploy();

const LOCKS_ON: Record<string, unknown> = process.env.LOCKS_SETTING ? JSON.parse(process.env.LOCKS_SETTING) : { locks: true };
const LOCKS_OFF: Record<string, unknown> = Object.fromEntries(Object.entries(LOCKS_ON).map(([k, v]) => [k, typeof v === "boolean" ? false : v === "on" ? "off" : 0]));

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

const energyOf = async (page: Page, n: number) => Number((await page.getByTestId(`text-lock-energy-${n}`).innerText()).replace(/[^\d.]/g, ""));

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
    const row = lines.locator('[data-testid^="row-line-"]').first();
    await row.waitFor({ timeout: 30_000 });
    line = Number((await row.getAttribute("data-testid"))!.replace("row-line-", ""));
    await row.click();
    const one = page.getByTestId("pane-object");
    await one.getByTestId("locks").waitFor({ timeout: 15_000 });
    await one.getByTestId("button-lock-open").click();
    await one.getByTestId("form-lock-create").waitFor();
    await one.locator('[data-testid^="button-lock-starter-"]').first().click();
    await one.getByTestId("button-lock-check").click();
    const verdict = one.getByTestId("text-lock-check");
    await verdict.waitFor({ timeout: 15_000 });
    assert.equal(await verdict.getAttribute("data-meets"), "true", `a ready-made predicate the line meets now: ${await verdict.innerText()}`);
    await one.getByTestId("input-lock-opening").fill("50");
    await one.getByTestId("button-lock-create").click();
    await one.getByTestId("text-lock-made").waitFor({ timeout: 30_000 });
    await one.getByTestId("lock-1").waitFor();
    assert.match(await one.getByTestId("text-lock-words-1").innerText(), /\w/);
    await shot(page, "locks-made");
  });

  await check("setting on: the Lines list marks the locked line", async () => {
    const mark = page.getByTestId(`mark-locks-${line}`);
    await mark.waitFor({ timeout: 15_000 });
    assert.equal(await mark.getAttribute("data-locks"), "1");
  });

  await check("setting on: What if warns that a change breaking the lock costs energy to remove it, naming the lock", async () => {
    const whatIf = await openPane(page, "what-if");
    // Try the changes What if offers until one breaks the lock (a ready-made predicate reads the line's numbers).
    const choices = await whatIf.getByTestId("select-what-if-change").locator("option").evaluateAll((os: HTMLOptionElement[]) => os.map(o => o.value));
    let warned = false;
    for (const c of choices) {
      await whatIf.getByTestId("select-what-if-change").selectOption(c);
      if (await whatIf.getByTestId("text-lock-breaks").waitFor({ timeout: 3_000 }).then(() => true, () => false)) { warned = true; break; }
    }
    assert.ok(warned, "some change What if offers breaks the lock");
    assert.match(await whatIf.getByTestId("text-lock-breaks").innerText(), /^This change breaks the lock “.+”: removing it costs [\d,.]+ energy\./);
  });

  await check("setting on: the lock's energy decays over world time", async () => {
    const one = await openPane(page, "object");
    const before = await energyOf(page, 1);
    await page.waitForFunction(([n, e]: [number, number]) => Number(document.querySelector(`[data-testid=text-lock-energy-${n}]`)?.textContent?.replace(/[^\d.]/g, "")) < e, [1, before] as [number, number], { timeout: 30_000 });
    await one.getByTestId("lock-1").waitFor();
  });

  await check("setting on: draining the lock to nothing removes it; the same change then breaks nothing", async () => {
    const one = await openPane(page, "object");
    await one.getByTestId("button-lock-energy-1").click();
    await one.getByTestId("button-lock-take-1").click();
    await one.getByTestId("input-lock-amount-1").fill(String(Math.ceil(await energyOf(page, 1)) + 1));
    await one.getByTestId("button-lock-fund-go-1").click();
    await one.getByTestId("lock-1").waitFor({ state: "detached", timeout: 30_000 });
    const whatIf = await openPane(page, "what-if");
    await whatIf.getByTestId("what-if-result").waitFor({ timeout: 15_000 });
    assert.equal(await whatIf.getByTestId("text-lock-breaks").count(), 0, "a drained lock still warns");
  });

  await check("setting off: no lock UI anywhere (One line, Lines, What if)", async () => {
    await game(page, LOCKS_OFF);
    const lines = await openPane(page, "objects");
    const row = lines.locator('[data-testid^="row-line-"]').first();
    await row.waitFor({ timeout: 30_000 });
    await row.click();
    await page.getByTestId("pane-object").waitFor();
    await page.waitForTimeout(2_000);
    for (const sel of ['[data-testid="locks"]', '[data-testid^="mark-locks-"]', '[data-testid="button-lock-open"]', '[data-testid="text-lock-breaks"]', "ul.v2v-locks"]) {
      assert.equal(await page.locator(sel).count(), 0, `${sel} shows with locks off`);
    }
  });

  await check("no uncaught page errors", () => assert.deepEqual(me.errors, []));
} finally {
  await browser.close();
}
report(everyone);
