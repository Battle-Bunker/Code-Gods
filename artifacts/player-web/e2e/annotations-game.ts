/**
 * Evidence for the owner (docs/engine-v2/annotations-design.md §11.4): the annotations flow captured IN A REAL GAME
 * against the LIVE local engine (`pnpm --filter @workspace/engine dev`), not the gallery. Practice games are dealt
 * until the player holds each wanted rule (the deal is the server's own); for each, at 1440×900: the Lines list at
 * rest, One line beside the goal card, a part selected with "what would make it rarer"; one rule at 390×844; and one
 * hard case from play (the steepest or farthest line on the board). Device scale 2, JPEG.
 *
 *   pnpm --filter @workspace/player-web run e2e:annotations-game [out dir]
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { assertNoSteps } from "./no-steps.ts";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const CLOUD = `http://127.0.0.1:${process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3210"}`;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const shots = process.env.SHOTS_DIR ?? path.join(import.meta.dirname, "shots");
mkdirSync(shots, { recursive: true });

if (!process.env.SKIP_DEPLOY) {
  const deploy = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: ROOT, stdio: "inherit" });
  assert.equal(deploy.status, 0, "deploy-static failed");
}

async function signIn(browser: any, who: string, viewport: { width: number; height: number }, deviceScaleFactor = 1) {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
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

/** The room's next game, shortened, through its owner's own session (the room.settings affordance). */
async function shorten(page: Page, code: string) {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  const found = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  const out = await client.mutation("v2/ops/room:settings" as never, { args: { overrides: { planningSeconds: 5, worldSeconds: 90 } }, roomId: found.roomId } as never) as { ok: boolean; error?: { message: string } };
  assert.ok(out.ok, `room.settings: ${out.error?.message}`);
}


const out = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "shots", "annotations-game"));
mkdirSync(out, { recursive: true });
const WANT = ["Square Area", "Whole Crossing", "Divisibility Ladder"];
const save = (page: Page, name: string) => page.screenshot({ path: path.join(out, `${name}.jpg`), type: "jpeg", quality: 60 });
const slug = (t: string) => t.toLowerCase().replace(/[^a-z]+/g, "-");

/** "y = −13x + 40" → the size of its biggest coefficient. */
const reach = (chip: string) => Math.max(0, ...[...chip.replace(/−/g, "-").matchAll(/-?\d+/g)].map(m => Math.abs(Number(m[0]))));

async function practiceGame(page: Page): Promise<string> {
  await page.goto(`${SITE}/`);
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  await shorten(page, page.url().split("/").at(-1)!);
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
  return (await page.getByTestId("pane-my-card").locator(".v2v-goal-title").first().innerText({ timeout: 20_000 })).trim();
}

async function play(page: Page) {
  await page.getByTestId("button-summon-first").click();
  await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
  const startNow = page.getByTestId("button-start-world");
  if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
  await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(18_000);   // the agents move the lines for a while: real play, not the dealt board
}

async function openLines(page: Page) {
  if (await page.getByTestId("button-jump-objects").count()) await page.getByTestId("button-jump-objects").click();
  await page.getByTestId("button-line-by-line-bar").click();
  await page.getByTestId("pane-objects").waitFor();
  await page.locator("[data-testid^=row-line-]").first().waitFor({ state: "visible", timeout: 10_000 });
}

const browser = await chromium.launch();
// Resumable: a rule (or the phone, or the hard case) already captured in `out` is not dealt for again.
const have = readdirSync(out);
const done = new Set<string>(WANT.filter(w => have.some(f => f.startsWith(`${slug(w)}-3-`))));
let hard = have.some(f => f.startsWith("hard-case-")), phone = have.some(f => f.startsWith("phone-"));
try {
  for (let attempt = 0; attempt < 30 && (done.size < WANT.length || !phone); attempt++) {
    const desktop = done.size < WANT.length;
    const viewport = desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 };
    const { context, page, errors } = await signIn(browser, desktop ? "alice" : "bob", viewport, 2);
    const rule = await practiceGame(page);
    console.log(`attempt ${attempt + 1} (${desktop ? "1440" : "390"}): dealt ${rule}`);
    if (!WANT.includes(rule) || (desktop && done.has(rule))) { await context.close(); continue; }
    await play(page);
    await openLines(page);
    const name = slug(rule);
    if (desktop) {
      await page.mouse.move(0, 0);
      await save(page, `${name}-1-lines-at-rest`);
      await page.locator("[data-testid^=marks-line-]").first().click();
      const line = page.getByTestId("object-hover-detail");
      await line.locator(".v2v-part").first().waitFor({ timeout: 20_000 });
      await save(page, `${name}-2-one-line-and-goal`);
      await line.locator(".v2v-part").first().click();
      await line.locator(".v2v-selchip").waitFor();
      const moves = line.locator(".v2v-moves, .v2v-next[data-kind=none]").first();
      await moves.scrollIntoViewIfNeeded();
      await save(page, `${name}-3-selected-and-moves`);
      await line.getByRole("button", { name: "Clear the selection" }).click();
      if (!hard) {
        // The hard case: the line with the biggest coefficient the agents have made, read from each line's own chip.
        const rows = page.locator("[data-testid^=row-line-]");
        let best = 0, pick = 0;
        for (let i = 0; i < Math.min(await rows.count(), 12); i++) {
          await rows.nth(i).locator("[data-testid^=marks-line-]").click();
          const chip = await line.locator(".v2v-chip-eq").first().innerText({ timeout: 5000 }).catch(() => "");
          if (reach(chip) > best) { best = reach(chip); pick = i; }
        }
        await rows.nth(pick).locator("[data-testid^=marks-line-]").click();
        await line.locator(".v2v-part").first().waitFor({ timeout: 20_000 });
        await save(page, `hard-case-${name}`);
        console.log(`hard case: row ${pick + 1}: ${await line.locator(".v2v-chip-eq").first().innerText()}`);
        hard = true;
      }
      done.add(rule);
    } else {
      await page.locator("[data-testid^=marks-line-]").first().click();
      const line = page.getByTestId("object-hover-detail");
      await line.locator(".v2v-part").first().waitFor({ timeout: 20_000 });
      await line.scrollIntoViewIfNeeded();
      await save(page, `phone-${name}-1-one-line`);
      await line.locator(".v2v-part").first().click();
      await line.locator(".v2v-selchip").waitFor();
      await line.locator(".v2v-moves, .v2v-next[data-kind=none]").first().scrollIntoViewIfNeeded();
      await save(page, `phone-${name}-2-selected-and-moves`);
      phone = true;
    }
    assert.deepEqual(errors, [], "no page errors");
    await context.close();
  }
} finally {
  await browser.close();
}
assert.equal(done.size, WANT.length, `captured ${[...done].join(", ")}`);
assert.ok(phone, "captured the phone");
console.log(`ok - annotations in a real game: ${out}`);
