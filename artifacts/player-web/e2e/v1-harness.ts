/**
 * The harness of the ported old end-to-end scenarios (e2e/v1-*.ts): the scenarios of archive/engine-v1's
 * artifacts/player-web/e2e, run against the v2 app in Chromium on the LIVE local engine
 * (`pnpm --filter @workspace/engine dev`). The build is uploaded to the engine's static hosting once per run
 * (SKIP_DEPLOY=1 reuses it).
 *
 * A ported scenario keeps the old one's intent and assertions. One that fails because the app lacks the behaviour is
 * a finding, not something to weaken: `missing(rows, name, fn)` runs it and expects it to fail, naming the inventory
 * rows (docs/engine-v2/v1-parity.json) it proves missing. When it starts passing the suite fails ("XPASS"), so the
 * row is flipped to present and the call becomes a `check`.
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";

const require = createRequire(import.meta.url);
export const { chromium } = require("playwright");
export type Page = any;
export type Browser = any;

export const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
export const CLOUD = `http://127.0.0.1:${process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3210"}`;
export const ROOT = path.resolve(import.meta.dirname, "../../..");
export const ENGINE = path.join(ROOT, "artifacts/engine");
export const shots = process.env.SHOTS_DIR ?? path.join(import.meta.dirname, "shots", "v1");
mkdirSync(shots, { recursive: true });

export const DESKTOP = { width: 1440, height: 900 };
export const PHONE = { width: 390, height: 844 };

/** Upload the app to the engine's site, once per run. */
export function deploy() {
  if (process.env.SKIP_DEPLOY) return;
  const out = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: ROOT, stdio: "inherit" });
  assert.equal(out.status, 0, "deploy-static failed");
}

export const convexRun = (fn: string, args: unknown) => {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: ENGINE, encoding: "utf8", env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" } }).trim();
  return out ? JSON.parse(out) : null;
};

export type Player = { context: any; page: Page; errors: string[]; subject: string; who: string };

/** Signs in through the test-only "fake" provider as one of its seeded people (alice, bob, carol, dana, admin…). */
export async function signIn(browser: Browser, who: string, viewport = DESKTOP, timeout = 15_000): Promise<Player> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: SITE }).catch(() => {});
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
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
  return { context, page, errors, subject, who };
}

/** A Convex client acting as the page's signed-in person (their own JWT): for settings a check needs without a form. */
export async function clientOf(page: Page) {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  return client;
}

/** The room's next game's settings, as its owner (the room.settings affordance). */
export async function roomSettings(page: Page, code: string, overrides: Record<string, unknown>) {
  const client = await clientOf(page);
  const found = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  const out = await client.mutation("v2/ops/room:settings" as never, { args: { overrides }, roomId: found.roomId } as never) as { ok: boolean; error?: { message: string } };
  assert.ok(out.ok, `room.settings: ${out.error?.message}`);
  return found.roomId;
}

/** Runs a room affordance through its Convex op as the page's signed-in person (e.g. "room:setSpectator", "seats:fillPracticePartners"). */
export async function roomOp(page: Page, code: string, op: string, args: Record<string, unknown> = {}) {
  const client = await clientOf(page);
  const found = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  const out = await client.mutation(`v2/ops/${op}` as never, { args, roomId: found.roomId } as never) as { ok: boolean; error?: { message: string } };
  assert.ok(out.ok, `${op}: ${out.error?.message}`);
}

export async function noHorizontalScroll(page: Page, label: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `${label}: the page scrolls sideways (${sw}px in ${iw}px)`);
}

export const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`) }).catch(() => {});

/** Opens the palette from its search box and types `query`. */
export async function palette(page: Page, query: string) {
  await page.keyboard.press("Control+K");
  await page.getByTestId("input-palette").fill(query);
}

const results = { passed: 0, failed: [] as string[], xfail: [] as string[], xpass: [] as string[] };
const pagesForShots: Page[] = [];
/** Pages a failure screenshots (each check's failure shot shows every page registered here). */
export function watch(...pages: Page[]) { pagesForShots.push(...pages); }
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").slice(0, 80);
async function failureShots(name: string) {
  for (const [i, p] of pagesForShots.entries()) {
    await shot(p, `FAIL-${slug(name)}-${i}`);
    // A menu or dialog left open by the failure would make the next check fail too.
    for (let k = 0; k < 2; k++) await p.keyboard?.press("Escape").catch(() => {});
  }
}

/** A ported scenario that must pass. A failure is reported (with screenshots) and the suite goes on. */
export async function check(name: string, fn: () => Promise<unknown> | unknown) {
  const t = Date.now();
  try {
    await fn();
    results.passed++;
    console.log(`ok - ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  } catch (e) {
    results.failed.push(name);
    console.log(`not ok - ${name}\n  ${String((e as Error)?.message ?? e).split("\n").slice(0, 6).join("\n  ")}`);
    await failureShots(name);
  }
}

/**
 * A ported scenario the v2 app does not yet pass because the behaviour is missing: `rows` are its ids in
 * docs/engine-v2/v1-parity.json. Expected to fail; passing fails the suite so the row is flipped.
 */
export async function missing(rows: string[], name: string, fn: () => Promise<unknown> | unknown, cleanup?: () => Promise<unknown>) {
  try {
    await fn();
    results.xpass.push(`${name} [${rows.join(", ")}]`);
    console.log(`XPASS - ${name} [${rows.join(", ")}]: it passes now; set the rows present and make it a check`);
  } catch (e) {
    results.xfail.push(`${name} [${rows.join(", ")}]`);
    console.log(`xfail - ${name} [${rows.join(", ")}]\n  ${String((e as Error)?.message ?? e).split("\n")[0]!.slice(0, 240)}`);
  } finally {
    await cleanup?.().catch(() => {});
  }
}

/** Prints the totals and sets the exit code (a failure or an unexpected pass fails the run). */
export function report(players: Player[] = []) {
  for (const p of players) if (p.errors.length) console.log(`page errors (${p.who}): ${p.errors.slice(0, 3).join(" | ")}`);
  console.log(`\n# ${results.passed} passed, ${results.failed.length} failed, ${results.xfail.length} expected failures (missing in v2), ${results.xpass.length} unexpected passes`);
  for (const f of results.failed) console.log(`#   FAILED: ${f}`);
  for (const f of results.xpass) console.log(`#   XPASS: ${f}`);
  if (process.env.LIST_XFAIL) for (const f of results.xfail) console.log(`#   xfail: ${f}`);
  process.exitCode = results.failed.length || results.xpass.length ? 1 : 0;
}

/** The room code of the room page the page is on. */
export const roomCodeOf = (page: Page) => page.url().replace(/[?#].*$/, "").split("/rooms/")[1]!.split("/")[0]!;
