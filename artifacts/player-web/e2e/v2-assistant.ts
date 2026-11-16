/**
 * The in-client assistant's pane against the LIVE local engine (`pnpm --filter @workspace/engine dev`, with AI_MOCK=1
 * so a `/mock …` script drives the model). At desktop (1440×900) and phone (390×844):
 *   create a room → "Play a practice game" → open "Your assistant" from a pane's menu → send a scripted message whose
 *   tool call opens "How to play" → the reply lands, the turn's chip reads "Open a pane" in the directory's words, and
 *   the dock shows the pane the assistant opened → the page never scrolls sideways.
 *
 *   pnpm --filter @workspace/player-web run e2e:assistant        (SKIP_DEPLOY=1 reuses the uploaded build)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
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

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`) });

const SCRIPT = `/mock ${JSON.stringify([
  { text: "I'll open How to play for you.", tools: [{ name: "view_openPane", input: { pane: "rules" } }] },
  { text: "Done: How to play is open." },
])}`;

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const { context, page, errors } = await signIn(browser, "admin", viewport);   // AI spends only in rooms an administrator owns
    await page.getByTestId("button-create-room").first().click();
    await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
    await page.getByTestId("button-practice-game").click();
    await page.waitForURL(/\/games\//, { timeout: 30_000 });

    // Open the assistant from the first pane's menu (as a player would), unless it is already on screen.
    const pane = page.getByTestId("pane-assistant");
    // On a phone an assistant already open waits as a lowered sheet at the bottom of the screen.
    if (!await pane.count() && await page.getByTestId("button-assistant-sheet").count()) await page.getByTestId("button-assistant-sheet").click();
    if (!await pane.count()) {
      await page.locator("[data-testid^=button-pane-menu-]").first().click();
      await page.getByTestId("button-open-pane-assistant").click();
    }
    await pane.getByTestId("assistant").waitFor({ timeout: 20_000 });
    await pane.getByTestId("assistant-empty").waitFor();
    assert.equal(await page.getByTestId("pane-rules").count(), 0, "How to play is not open before the assistant opens it");

    // v1's starter chips: three questions for the phase (planning here).
    const chips = await pane.getByTestId("button-assistant-suggestion").allInnerTexts();
    assert.deepEqual(chips, ["Explain my goal simply", "Write me a first agent", "What should my agent do?"], `${label}: the starter chips`);
    await pane.getByTestId("input-assistant").fill(SCRIPT);
    await pane.getByTestId("button-assistant-send").click();
    await pane.getByTestId("row-assistant-user").first().waitFor({ timeout: 20_000 });
    const reply = pane.getByTestId("row-assistant-reply").filter({ hasText: "Done: How to play is open." });
    await reply.waitFor({ timeout: 60_000 });
    const chip = pane.locator('[data-testid=chip-assistant][data-tool="view_openPane"]');
    await chip.waitFor({ timeout: 20_000 });
    assert.match(await chip.innerText(), /Open a pane/);
    assert.equal(await chip.getAttribute("data-ok"), "true", "the call succeeded");
    // v1's ToolDetail: the chip opens what the assistant sent and what came back.
    await chip.click();
    const detail = pane.getByTestId("assistant-tool-detail");
    await detail.waitFor({ timeout: 15_000 });
    assert.match(await detail.getByTestId("text-tool-args").innerText(), /"pane":\s*"rules"/, `${label}: the call's arguments`);
    assert.ok((await detail.getByTestId("text-tool-result").innerText()).trim().length > 0, `${label}: what came back`);
    await chip.click();
    // The assistant's view tool changed the human's layout, and the dock follows it.
    await page.getByTestId("pane-rules").waitFor({ timeout: 20_000 });
    assert.equal(await pane.getByTestId("input-assistant").inputValue(), "", "the input clears after sending");
    await pane.scrollIntoViewIfNeeded();
    await shot(page, `assistant-${label}`);
    // The conversation is listed; the settings show the mode and the allowance.
    assert.ok((await pane.getByTestId("select-assistant-thread").locator("option").count()) >= 1);
    await pane.getByTestId("button-assistant-settings").click();
    await pane.getByTestId("text-assistant-allowance").waitFor();
    assert.equal(await pane.getByTestId("button-assistant-mode-onRequest").getAttribute("aria-pressed"), "true");
    await shot(page, `assistant-${label}-settings`);
    if (label === "phone") {
      // v1's bottom sheet: the assistant over any pane, lowered to a bar and raised again.
      const bar = page.getByTestId("button-assistant-sheet");
      await bar.click();
      assert.equal(await pane.count(), 0, "phone: the lowered sheet is a bar");
      await bar.click();
      await pane.getByTestId("assistant").waitFor();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${label}: the page does not scroll sideways (${overflow}px)`);
    assert.deepEqual(errors, [], `${label}: no page errors`);
    console.log(`${label}: reply, chip "${(await chip.innerText()).trim()}" and the opened pane seen`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("ok - the assistant pane sends, shows the reply and its chips, and its view tool opens a pane, at desktop and phone");
