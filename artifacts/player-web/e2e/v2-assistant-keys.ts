/**
 * Reaching the assistant (v1's dock keys, AskAboutObject and timeline), against the LIVE local engine with AI_MOCK=1, at
 * 1440×900 in a practice game run by an administrator (AI spends only there):
 *   "/" outside a field opens and focuses the assistant's composer; Escape in the empty composer leaves it; Ctrl+`
 *   focuses it again; the palette's "Focus assistant (Ctrl+`)" does too; "ask my assistant" on One line puts
 *   "Line N: " in the composer (focused, nothing sent); a long scripted answer leaves the transcript at its end when the
 *   suggestion chips come back under it (v1: the chips hid the end of an answer).
 *
 *   pnpm --filter @workspace/player-web run e2e:assistant-keys        (SKIP_DEPLOY=1 reuses the uploaded build)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const ROOT = path.resolve(import.meta.dirname, "../../..");
if (!process.env.SKIP_DEPLOY) {
  const deploy = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: ROOT, stdio: "inherit" });
  assert.equal(deploy.status, 0, "deploy-static failed");
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page: Page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  await page.goto(`${SITE}/`);
  await page.getByTestId("button-login").waitFor();
  const url = await page.evaluate(async () => {
    const r = await fetch("/api/auth/sign-in/oauth2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: "fake", callbackURL: "/" }) });
    return ((await r.json()) as { url: string }).url;
  });
  await page.goto(url);
  await page.getByRole("link", { name: /\(admin\)/ }).click();
  await page.waitForURL(`${SITE}/`);
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
  await page.getByTestId("dock").waitFor({ timeout: 60_000 });

  const input = page.getByTestId("input-assistant");
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "input-assistant");
  const waitFocused = async (what: string) => {
    for (const end = Date.now() + 15_000; !(await focused()); await page.waitForTimeout(100)) {
      if (Date.now() > end) {
        const why = await page.evaluate(() => JSON.stringify({ active: document.activeElement?.tagName + ":" + document.activeElement?.getAttribute("data-testid"),
          dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map(d => d.getAttribute("data-testid") ?? d.className.slice(0, 40)),
          composer: !!document.querySelector("[data-testid=input-assistant]"), x: 1, toasts: [...document.querySelectorAll("ol li")].map(l => (l as HTMLElement).innerText).filter(Boolean), dock: document.querySelector("[data-testid=dock-desktop]")?.getAttribute("data-dock") }));
        throw new Error(`${what}: the composer is not focused: ${why}; logs ${logs.join(" | ")}`);
      }
    }
  };
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const logs: string[] = [];
  page.on("console", (m: any) => logs.push(m.text().slice(0, 200)));

  // "/" opens and focuses the composer; Escape in it, empty, leaves it; Ctrl+` brings it back.
  await page.keyboard.press("/");
  await waitFocused("/");
  assert.equal(await input.inputValue(), "", "/ is not typed into the composer");
  await page.keyboard.press("Escape");
  assert.equal(await focused(), false, "Escape in an empty composer leaves it");
  await page.keyboard.press("Control+Backquote");
  await waitFocused("Ctrl+`");
  console.log("ok   / and Ctrl+` focus the composer; Escape leaves it");

  // The palette's row.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+K");
  await page.getByTestId("input-palette").fill("Focus assistant");
  await page.keyboard.press("Enter");
  await waitFocused("the palette's Focus assistant");
  console.log("ok   the palette's Focus assistant (Ctrl+`)");

  // "ask my assistant" on One line: the line in the composer, focused, nothing sent.
  await page.keyboard.press("Escape");
  await page.getByTestId("button-summon-first").click();
  await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
  const startNow = page.getByTestId("button-start-world");
  if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
  await page.locator("[data-testid^=row-line-]").first().click({ timeout: 30_000 });
  const ask = page.getByTestId("pane-object").locator("[data-testid^=button-object-ask-]");
  await ask.waitFor({ timeout: 30_000 });
  const n = (await ask.getAttribute("data-testid"))!.slice("button-object-ask-".length);
  await ask.click();
  await waitFocused("ask my assistant");
  assert.equal(await input.inputValue(), `Line ${n}: `);
  assert.equal(await page.getByTestId("row-assistant-user").count(), 0, "nothing was sent");
  console.log(`ok   ask my assistant on line ${n} fills the composer`);

  // v1: the transcript stays at its end when the chips come back under a long answer.
  const lines = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
  await input.fill(`/mock ${JSON.stringify([{ text: [...lines, "THE END"].join("\n") }])}`);
  await page.getByTestId("button-assistant-send").click();
  await page.getByTestId("row-assistant-reply").filter({ hasText: "THE END" }).waitFor({ timeout: 60_000 });
  await page.getByTestId("assistant-suggestions").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  const gap = await page.getByTestId("assistant-transcript").evaluate((el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight);
  assert.ok(gap < 24, `the end of the answer is ${gap}px below the visible transcript`);
  console.log(`ok   the transcript stays at its end when the chips appear (gap ${gap}px)`);
  // The palette's "New conversation" and "Switch assistant conversation…" (v1).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const thread = page.getByTestId("select-assistant-thread");
  assert.notEqual(await thread.inputValue(), "new", "the answered conversation is the one in view");
  await page.keyboard.press("Control+K");
  await page.getByTestId("input-palette").fill("New conversation");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => (document.querySelector("[data-testid=select-assistant-thread]") as HTMLSelectElement | null)?.value === "new", null, { timeout: 10_000 });
  await waitFocused("New conversation");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+K");
  await page.getByTestId("input-palette").fill("Switch assistant conversation");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "select-assistant-thread", null, { timeout: 10_000 });
  console.log("ok   the palette starts a new conversation and opens the conversation picker");
  // v1's "Who am I" from the palette: who you are signed in as and what you are in this room.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+K");
  await page.getByTestId("input-palette").fill("Show who I am");
  await page.keyboard.press("Enter");
  const info = page.getByTestId("panel-palette-info");
  await info.waitFor({ timeout: 10_000 });
  assert.match(await info.innerText(), /You are .+, the owner and a player in room [A-Z0-9]+/);
  await page.keyboard.press("Escape");
  console.log("ok   Show who I am names you and your place in the room");
  assert.deepEqual(errors, [], "no page errors");
} finally {
  await browser.close();
}
console.log("ok - the assistant is a key away, an object a click away, and its answers stay in view");
