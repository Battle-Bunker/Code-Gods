/**
 * The climb, end to end at desktop (1440×900) and phone (390×844), on seeded games (convex/v2/testing.ts). Agents are
 * hill climbers (owner, 14 November): the face shows the climb from here, never a destination to agree or hold.
 * (1) On line 1, each candidate move shows your bits × the others' total bits = points and the change from now
 *     (v2/play:othersAt), "Best for points" first or "Best for my rarity", and the climb from here (or "Stuck here").
 * (2) The last moves on line 1 (seed `contested`: each move undid the last) are listed ↑/↓ for you and for the others,
 *     and said to undo each other.
 * (3) Objects are unique: once line 2 is put in a candidate's state, that candidate shows as not available.
 * (4) In an ended game the summary says, per contested line, whether you climbed together (seed `climbed`) or undid
 *     each other (seed `contested`).
 * Captures each into the given directory (deviceScaleFactor 2).
 *
 *   node --experimental-transform-types e2e/climb.ts [screenshot dir]      (SKIP_DEPLOY=1 reuses the upload)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { q } from "@workspace/v2-core";
import { fromMC, lineType } from "@workspace/v2-linear";

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

/** "y = −3x + 10" → { m: -3, c: 10 } ("y = x", "y = −x − 4", "y = 7"). */
function mc(eq: string): { m: number; c: number } {
  const t = eq.replace(/\s/g, "").replace(/−/g, "-").replace(/^y=/, "");
  const mm = /^([+-]?\d*)x/.exec(t);
  const m = mm ? (mm[1] === "" || mm[1] === "+" ? 1 : mm[1] === "-" ? -1 : Number(mm[1])) : 0;
  const rest = mm ? t.slice(mm[0].length) : t;
  return { m, c: rest ? Number(rest) : 0 };
}

const browser = await chromium.launch();
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 70 });
/** Each candidate row's "your X bits" (the first number of its points formula). */
const yours = async (pane: any) => (await pane.locator(".v2v-move-option:not([data-unavailable]) .v2v-move-bits").allInnerTexts()).map((t: string) => Number(/your ([\d.,]+) bits/.exec(t)![1]!.replace(/,/g, "")));

try {
  for (const [label, viewport, who] of [["desktop", { width: 1440, height: 900 }, "alice"], ["phone", { width: 390, height: 844 }, "bob"]] as const) {
    const { context, page, errors, subject } = await signIn(browser, who, viewport);
    const room = `C${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const g = convexRun("v2/testing:seedGame", { owner: subject, practice: 2, code: room, contested: 1 });
    await page.goto(`${SITE}/rooms/${room}/games/${g.gameId}`);
    if (label === "phone" && await page.getByTestId("button-jump-objects").count()) await page.getByTestId("button-jump-objects").click();
    const row = page.getByTestId("row-line-1");
    await row.scrollIntoViewIfNeeded({ timeout: 20_000 });
    await row.click();
    const line = page.getByTestId("pane-object");
    await line.locator(".v2v-move-option[data-points]").first().waitFor({ timeout: 20_000 });

    // (1) Each move: your bits × the others' total = points, and the change from now; best for points first.
    const rows = line.locator(".v2v-move-option");
    assert.ok(await rows.count() >= 2, `${label}: candidates`);
    for (const t of await line.locator(".v2v-move-option .v2v-move-bits").allInnerTexts())
      assert.match(t, /your [\d.,]+ bits? × others' [\d.,]+ bits? [=≈] [\d.,]+ points? \([+−][\d.,]+ from now\)/, `${label}: ${t}`);
    const points = await rows.evaluateAll((els: Element[]) => els.map(e => Number(e.getAttribute("data-points"))));
    assert.deepEqual([...points].sort((a, b) => b - a), points, `${label}: best for points first`);
    assert.match(await line.getByTestId("text-climb").innerText(), /^(The climb from here: “.+” takes your points from [\d.,]+ points? to [\d.,]+ points?|Stuck here: no single move raises your points above)/);
    await line.getByTestId("button-order-rarity").click();
    const mine = await yours(line);
    assert.deepEqual([...mine].sort((a, b) => b - a), mine, `${label}: best for my rarity first`);
    await line.getByTestId("button-order-points").click();
    assert.equal(await line.getByRole("button", { name: /Propose|Hold it here/ }).count(), 0, `${label}: no destination to propose or hold`);

    // (2) The last moves on the line: each ↑/↓ for you and for the others; these undo each other.
    const history = line.getByTestId("climb-history");
    await history.waitFor({ timeout: 10_000 });
    assert.equal(await history.getAttribute("data-kind"), "undoing", label);
    assert.equal(await history.getByTestId("climb-step").count(), 4);
    assert.match(await history.getByTestId("climb-step").first().innerText(), /^Your agent ↑ you 1\.00 bits · ↓ the others 1\.00 bits$/);
    assert.match(await history.getByTestId("text-climb-verdict").innerText(), /^Stuck: these moves undo each other/);
    await line.locator(".v2v-moves").scrollIntoViewIfNeeded();
    await shot(page, `climb-${label}.jpg`);

    // (3) Objects are unique: put line 2 where the best candidate would take line 1; that move is no longer available.
    const best = line.locator(".v2v-move-option[data-points]").first();
    const target = mc((await best.locator(".v2v-move-result").innerText()).replace(/^\s*→\s*/, ""));
    convexRun("v2/testing:setObjectState", { gameId: g.gameId, number: 2, state: lineType.encode({ lines: [fromMC(q(target.m), q(target.c))] }) });
    const gone = line.getByTestId("text-move-unavailable");
    await gone.waitFor({ timeout: 15_000 });
    assert.equal(await gone.innerText(), "Not available: line 2 is already like this, and no two lines may be the same.");
    await gone.scrollIntoViewIfNeeded();
    await shot(page, `unavailable-${label}.jpg`);

    // (4) The end summary: per contested line, climbed together or undid each other.
    const room2 = `D${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const e = convexRun("v2/testing:seedGame", { owner: subject, practice: 2, code: room2, phase: "ended", contested: 1, climbed: 2, tugs: 2 });
    await page.goto(`${SITE}/rooms/${room2}/games/${e.gameId}`);
    if (await page.getByTestId("tab-results").count()) await page.getByTestId("tab-results").click();
    const undone = page.getByTestId("summary-climb-1"), together = page.getByTestId("summary-climb-2");
    await together.waitFor({ timeout: 30_000 });
    assert.match(await undone.innerText(), /^Line 1: you and Practice partner \d undid each other's moves \(4 moves\): your points [\d.,]+ → [\d.,]+ points?\.$/, label);
    assert.match(await together.innerText(), /^Line 2: you and Practice partner \d climbed together, every move raising the points: your points [\d.,]+ → [\d.,]+ points?\.$/, label);
    await together.scrollIntoViewIfNeeded();
    await shot(page, `summary-${label}.jpg`);
    assert.deepEqual(errors, [], `${label}: no page errors`);
    console.log(`ok ${label}: the climb, the last moves, an unavailable move, and the summary's contested lines`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("ok - the climb at desktop and phone");
