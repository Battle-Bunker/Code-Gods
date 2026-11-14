/**
 * The app on engine v2, in Chromium against the LIVE local engine (`pnpm --filter @workspace/engine dev`) with its v2
 * test fixtures (convex/v2/testing.ts): the build is uploaded to the engine's static hosting, so the browser talks to
 * the real site origin (Better Auth cookie, Convex JWTs, live queries, affordances), as deployed.
 *
 *   pnpm --filter @workspace/engine dev
 *   pnpm --filter @workspace/player-web run e2e:site          (SKIP_DEPLOY=1 reuses the uploaded build)
 *
 * At desktop (1440×900) and phone (390×844) widths:
 *  - home: the empty state offers Create room and Join with a code; Create room seats you and opens the room;
 *  - room: a lone owner is offered a practice game against practice partners (ux-lessons 1.1–1.2), never "not available";
 *  - a seeded live line game: your points and energy in the game bar (ux 2.5); the default panes; Lines rows with a
 *    compact face; opening a line shows every representation the rule depends on, and the Lines pane stays;
 *    the act log speaks in points and ✨ rarity, never bits; no horizontal page scroll;
 *  - a seeded planning game: the planning line counts down, and the owner sees "Start the world now".
 * Screenshots go to SHOTS_DIR (default e2e/shots, gitignored).
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
const shots = process.env.SHOTS_DIR ?? path.join(import.meta.dirname, "shots");
mkdirSync(shots, { recursive: true });

const convexRun = (fn: string, args: unknown) => {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: ENGINE, encoding: "utf8", env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" } }).trim();
  return out ? JSON.parse(out) : null;
};

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
  const subject = await page.evaluate(async () => ((await (await fetch("/api/auth/get-session")).json()) as { user: { id: string } }).user.id);
  return { context, page, errors, subject };
}

async function noHorizontalScroll(page: Page, label: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `${label}: the page scrolls sideways (${sw}px in ${iw}px)`);
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`) });
const code = () => `E${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const me = await signIn(browser, label === "desktop" ? "alice" : "bob", viewport);
    const page = me.page;

    await check(`${label}: Create room seats you and offers a practice game`, async () => {
      await page.getByTestId("button-create-room").first().click();
      await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
      const status = page.getByTestId("text-viewer-seat");
      await status.waitFor();
      assert.match(await status.innerText(), /A game needs three players\. Play a practice game against practice partners, or invite friends\./);
      await page.getByTestId("button-practice-game").waitFor();
      assert.doesNotMatch(await page.locator("body").innerText(), /not available/i);
      await noHorizontalScroll(page, `${label} room`);
      await shot(page, `v2-room-${label}`);
    });

    await check(`${label}: a live line game shows your totals, the panes and the lines' faces`, async () => {
      const room = code();
      const g = convexRun("v2/testing:seedGame", { owner: me.subject, practice: 2, code: room });
      await page.goto(`${SITE}/rooms/${room}/games/${g.gameId}`);
      await page.getByTestId("text-my-total").waitFor();
      assert.match(await page.getByTestId("text-my-total").innerText(), /points/);
      assert.match(await page.getByTestId("text-my-energy").innerText(), /⚡/);
      for (const pane of ["objects", "my-card", "feed", "agents", "race"]) await page.getByTestId(`pane-${pane}`).waitFor();
      const row = page.locator("[data-testid^=row-line-]").first();
      await row.waitFor();
      await page.locator("[data-testid^=marks-line-]").first().waitFor();   // each row's face arrives with its own subscription
      await page.getByTestId("pane-feed").getByText(/Your agent/).first().waitFor();
      const feed = await page.getByTestId("pane-feed").innerText();
      assert.match(feed, /Your agent/);
      assert.doesNotMatch(feed, /\bbits?\b|payoff|object/i, "the act log speaks in player words");
      await noHorizontalScroll(page, `${label} game`);
      await shot(page, `v2-game-${label}`);
      await row.click();
      await page.getByTestId("pane-object").waitFor();
      await page.getByTestId("pane-objects").waitFor({ timeout: 5000 });   // the list a line is opened from stays
      await page.getByTestId("pane-object").getByText("slope-intercept").first().waitFor();   // the rule's representations
      await shot(page, `v2-line-${label}`);
    });

    await check(`${label}: planning shows one countdown and the owner's "Start the world now"`, async () => {
      const room = code();
      const g = convexRun("v2/testing:seedGame", { owner: me.subject, practice: 2, code: room, phase: "planning" });
      await page.goto(`${SITE}/rooms/${room}/games/${g.gameId}`);
      const line = page.getByTestId("planning-line");
      await line.waitFor();
      assert.match(await line.innerText(), /The world starts in \d+:\d\d/);
      await page.getByTestId("button-start-world").waitFor();
      assert.equal(await page.getByTestId("game-timer").count(), 0, "one countdown in planning");
      await shot(page, `v2-planning-${label}`);
    });

    assert.deepEqual(me.errors, [], `${label}: no page errors`);
    await me.context.close();
  }
} finally {
  await browser.close();
}
console.log(`${passed} checks passed`);
