/**
 * The old debt scenario (archive/engine-v1 e2e/debt-shots.ts), ported to the v2 app as checks: in a running game,
 * My agents shows what an agent's moves actually cost beside what it was told at the summon; an agent's Destroy asks
 * first, saying what happens to the energy it holds (or owes), and the agent then stops. v1 shot these states without
 * asserting; v2 asserts them.
 *
 *   pnpm --filter @workspace/engine dev
 *   pnpm --filter @workspace/player-web run e2e:v1-agents          (SKIP_DEPLOY=1 reuses the uploaded build; ~1 min)
 *
 * v2 changed: a practice game (v1: bob and an AI seat); the first agent is "Summon my first agent" (v1: a Steady agent
 * through commands:submit). An agent in debt needs a dear agent to run long enough to owe; the debt rules themselves are
 * unit-tested in lib/v2-economy (energy.ts), so this suite checks what the panel says, not how a debt arises.
 */
import assert from "node:assert/strict";
import { DESKTOP, chromium, check, deploy, missing, report, roomSettings, signIn, watch, type Page, type Player } from "./v1-harness.ts";

deploy();

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

const browser = await chromium.launch();
const everyone: Player[] = [];
try {
  const me = await signIn(browser, "admin", DESKTOP);
  everyone.push(me);
  const page = me.page;
  watch(page);
  let agentId = "";

  await check("a practice game runs with the first agent summoned", async () => {
    await page.getByTestId("button-create-room").first().click();
    await page.waitForURL(/\/rooms\/[0-9A-Z]+$/);
    const code = (await page.getByTestId("text-room-code").innerText()).trim();
    await roomSettings(page, code, { planningSeconds: 5, worldSeconds: 600 });
    await page.getByTestId("button-practice-game").click();
    await page.waitForURL(/\/games\//, { timeout: 60_000 });
    await page.getByTestId("button-summon-first").click({ timeout: 60_000 });
    await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 90_000 });
    if (await page.getByTestId("button-start-world").count()) await page.getByTestId("button-start-world").click().catch(() => {});
    await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 60_000 });
    const agents = await openPane(page, "agents");
    const row = agents.locator('[data-testid^="row-agent-"]').first();
    await row.waitFor({ timeout: 30_000 });
    agentId = (await row.getAttribute("data-testid"))!.replace("row-agent-", "");
  });

  await check("My agents: once the agent has moved, its actual average cost per move", async () => {
    const actual = page.getByTestId(`text-actual-act-cost-${agentId}`);
    await actual.waitFor({ timeout: 90_000 });
    assert.match(await actual.innerText(), /^Actual average [\d,]+\.\d\d energy per move$/);
  });

  await missing(["e2e-debt-shots"], "My agents: the act cost it was told at the summon, beside the actual", async () => {
    await page.getByTestId(`text-expected-act-cost-${agentId}`).waitFor({ timeout: 3_000 });
  });

  await check("Destroy asks first, saying what happens to the energy the agent holds; confirmed, the agent stops and leaves the list", async () => {
    await page.getByTestId(`button-destroy-${agentId}`).click();
    const dialog = page.getByTestId(`button-destroy-${agentId}-confirm`);
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /stops for good and makes no more moves\. (The [\d,]+ energy it holds comes back to you|It owes [\d,]+ energy: that debt moves to your own store|It holds no energy now, so none comes back)\./);
    await page.getByTestId(`button-destroy-${agentId}-confirm-ok`).click();
    await page.getByTestId(`row-agent-${agentId}`).waitFor({ state: "detached", timeout: 30_000 });
  });

  await check("no uncaught page errors", () => assert.deepEqual(me.errors, []));
} finally {
  await browser.close();
}
report(everyone);
