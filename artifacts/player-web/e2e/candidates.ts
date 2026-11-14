/**
 * Playtest round 8, end to end at desktop (1440×900) and phone (390×844), on seeded games (convex/v2/testing.ts):
 * (1) on line 1, each "What would make it rarer" candidate shows your bits × the others' total bits = points
 *     (v2/play:othersAt), ordered "Best for points" or "Best for my rarity";
 * (2) one tap from a candidate: "Propose this in chat" opens the chat with the proposal in plain words in its box; a
 *     board in a message is drawn.
 * Captures each into the given directory (deviceScaleFactor 2).
 *
 *   node --experimental-transform-types e2e/candidates.ts [screenshot dir]      (SKIP_DEPLOY=1 reuses the upload)
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
const OUT = process.argv[2] ?? path.join(import.meta.dirname, "shots");
mkdirSync(OUT, { recursive: true });

const convexRun = (fn: string, args: unknown) => {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: ENGINE, encoding: "utf8", env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" } }).trim();
  return out ? JSON.parse(out) : null;
};
if (!process.env.SKIP_DEPLOY) {
  const deploy = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: ROOT, stdio: "inherit" });
  assert.equal(deploy.status, 0, "deploy-static failed");
}

async function signIn(browser: any, who: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
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
  await page.getByRole("link", { name: new RegExp(`\\(${who}\\)`) }).click();
  await page.waitForURL(`${SITE}/`);
  await page.getByTestId("button-avatar").waitFor();
  const subject = await page.evaluate(async () => ((await (await fetch("/api/auth/get-session")).json()) as { user: { id: string } }).user.id);
  return { context, page, errors, subject };
}

const browser = await chromium.launch();
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 70 });
/** Each candidate row's "your X bits" (the first number of its points formula). */
const yours = async (pane: any) => (await pane.locator(".v2v-move-option .v2v-move-bits").allInnerTexts()).map((t: string) => Number(/your ([\d.,]+) bits/.exec(t)![1]!.replace(/,/g, "")));

try {
  for (const [label, viewport, who] of [["desktop", { width: 1440, height: 900 }, "alice"], ["phone", { width: 390, height: 844 }, "bob"]] as const) {
    const { context, page, errors, subject } = await signIn(browser, who, viewport);
    const room = `C${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const g = convexRun("v2/testing:seedGame", { owner: subject, practice: 2, code: room, contested: 1 });
    await page.goto(`${SITE}/rooms/${room}/games/${g.gameId}`);
    const openLine = async () => {
      if (label === "phone" && await page.getByTestId("button-jump-objects").count()) await page.getByTestId("button-jump-objects").click();
      const row = page.getByTestId("row-line-1");
      await row.scrollIntoViewIfNeeded({ timeout: 20_000 });
      await row.click();
      const line = page.getByTestId("pane-object");
      await line.locator(".v2v-move-option[data-points]").first().waitFor({ timeout: 20_000 });
      return line;
    };

    // (1) Each candidate: your bits × the others' total = points; ordered by points, or by your rarity.
    let line = await openLine();
    const rows = line.locator(".v2v-move-option");
    const n = await rows.count();
    assert.ok(n >= 2, `${label}: ${n} candidates`);
    for (const t of await line.locator(".v2v-move-option .v2v-move-bits").allInnerTexts())
      assert.match(t, /your [\d.,]+ bits? × others' [\d.,]+ bits? [=≈] [\d.,]+ points?/, `${label}: ${t}`);
    const points = (await rows.evaluateAll((els: Element[]) => els.map(e => Number(e.getAttribute("data-points")))));
    assert.deepEqual([...points].sort((a, b) => b - a), points, `${label}: best for points first`);
    assert.equal(await line.getByTestId("button-order-points").getAttribute("aria-pressed"), "true");
    await line.getByTestId("button-order-rarity").click();
    const mine = await yours(line);
    assert.deepEqual([...mine].sort((a, b) => b - a), mine, `${label}: best for my rarity first`);
    await line.locator(".v2v-moves").scrollIntoViewIfNeeded();
    await shot(page, `candidates-${label}.jpg`);
    await line.getByTestId("button-order-points").click();

    // (2) "Propose this in chat": the chat opens with the proposal written in its box, in plain words; sent by the player.
    line = await openLine();
    await line.getByTestId("button-propose").first().click();
    const box = page.getByTestId("input-chat");
    await box.waitFor({ timeout: 10_000 });
    const draft = await box.inputValue();
    assert.match(draft, /^Shall we settle line 1 at y = .+ and both hold it\? There I get [\d.]+ bits? and the rest of you [\d.]+ bits? together\.$/, `${label}: ${draft}`);
    await page.getByTestId("button-send-chat").click();
    await page.getByTestId("chat").getByText(draft).waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => (document.querySelector("[data-testid=input-chat]") as HTMLTextAreaElement | null)?.value === "", null, { timeout: 10_000 });
    // A board proposal (grids) is drawn as a board in the chat, not sixteen digits.
    await box.fill("Shall we settle grid 3 like this and both hold it?\n9 7 7 9\n8 5 5 8\n7 9 9 7\n9 7 7 9\nThere I get 4.20 bits and the rest of you 6.10 bits together.");
    await page.getByTestId("button-send-chat").click();
    const board = page.getByTestId("chat-board").last();
    await board.waitFor({ timeout: 10_000 });
    assert.equal(await board.locator("span").count(), 16, `${label}: sixteen cells`);
    await board.scrollIntoViewIfNeeded();
    await shot(page, `proposed-${label}.jpg`);

    assert.deepEqual(errors, [], `${label}: no page errors`);
    console.log(`ok ${label}: candidates with others' totals, propose per candidate`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("ok - candidates, proposals and held deals at desktop and phone");
