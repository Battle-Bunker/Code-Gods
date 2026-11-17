/**
 * The desktop dock gives every open pane a usable size (playtest round 1, item 1), against the LIVE local engine. At
 * 1920×1080 and 1280×720, in a practice game:
 *   planning, live and ended: every pane of the default arrangement has a body at least 300 px wide and 220 px tall and
 *   its key elements (the goal card's rule, the lines' sort, the act log, the agent's stats line,
 *   the leaderboard's chart, the results' headline and "Watch the replay") lie wholly inside the pane, inside the window → pointing at a line shows its detail over the list (the dock unchanged)
 *   → a dragged gutter is stored and comes back after a reload.
 * At 390×844 the phone stays stacked, and the forge's "Open My agents" adds My agents to the stack (every other pane
 * stays in the jump row) and scrolls to it (a persona walk saw it replace the stack with Lines).
 *
 *   pnpm --filter @workspace/player-web run e2e:dock        (SKIP_DEPLOY=1 reuses the uploaded build)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;
type Box = { x: number; y: number; width: number; height: number };

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const CLOUD = `http://127.0.0.1:${process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3210"}`;
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

/** A practice game in a new room, shortened through the owner's own session (room.settings). */
async function practiceGame(page: Page, worldSeconds: number) {
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  const code = page.url().split("/").at(-1)!;
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  const found = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  const out = await client.mutation("v2/ops/room:settings" as never, { args: { overrides: { planningSeconds: 60, worldSeconds } }, roomId: found.roomId } as never) as { ok: boolean; error?: { message: string } };
  assert.ok(out.ok, `room.settings: ${out.error?.message}`);
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
}

const inside = (inner: Box, outer: Box, slack = 1) =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.width <= outer.x + outer.width + slack && inner.y + inner.height <= outer.y + outer.height + slack;

/** The key element of each pane: what a player must see without scrolling. */
const KEY: Record<string, string | string[]> = {
  overview: "[data-testid=text-next-step]",
  "my-card": "[data-testid=text-goal-main], [data-testid=goal-card] .v2v-goal-card",
  forge: "[data-testid=select-forge-language]",
  objects: "[data-testid=lines-sort]",
  object: "[data-testid=text-line-points]",
  feed: "[data-testid=text-move-line], [data-testid=text-tug-line], [data-testid=feed-empty]",
  // The agent's stats line (energy, moves, skips, failures, spend, points: round 2 saw it cut at 1440×900).
  agents: "[data-testid^=text-agent-work-]",
  race: "[data-testid=race-chart], [data-testid=race-empty]",
  results: ["[data-testid=text-results-headline]", "[data-testid=button-watch-replay]"],
};

/** Every pane named is on screen with a usable body, and its key element is wholly inside it. */
/** The panes in the dock's text form ("row(column(a 50,b 50) 30, c|*d 70)" → a, b, c, d). */
const paneSet = (dock: string) => new Set([...dock.matchAll(/\*?([a-z][a-z-]*)/g)].map(m => m[1]!).filter(w => w !== "row" && w !== "column"));
/** Opening a pane never closes another (coordinator, round 6: "was Results replaced?"): every pane before is still docked. */
function noneClosed(before: string, after: string, what: string) {
  const now = paneSet(after);
  for (const p of paneSet(before)) assert.ok(now.has(p), `${what}: opening a pane closed ${p}: ${before} → ${after}`);
}

async function usable(page: Page, panes: string[], what: string) {
  const viewport = page.viewportSize() as { width: number; height: number };
  const screen = { x: 0, y: 0, width: viewport.width, height: viewport.height };
  for (const pane of panes) {
    const section = page.getByTestId(`pane-${pane}`);
    await section.waitFor({ timeout: 20_000 }).catch(async (e: Error) => {
      await page.screenshot({ path: path.join(shots, "dock-failed.png") });
      throw new Error(`${what}: ${pane} is not on screen; the dock: ${await dockText(page)} (${e.message.split("\n")[0]})`);
    });
    const box = await section.boundingBox() as Box;
    assert.ok(box.width >= 300 && box.height >= 220, `${what}: ${pane}'s body is ${Math.round(box.width)}×${Math.round(box.height)} px`);
    assert.ok(inside(box, screen), `${what}: ${pane} is inside the window (${JSON.stringify(box)})`);
    for (const sel of [KEY[pane]!].flat()) {
      const key = section.locator(sel).first();
      await key.waitFor({ timeout: 30_000 });
      const k = await key.boundingBox() as Box;
      assert.ok(inside(k, box), `${what}: ${pane}'s key element (${sel}) is cut: ${JSON.stringify(k)} in ${JSON.stringify(box)}`);
    }
  }
}

/** Every open pane has its own close button, always (owner, 17 November); pressing one closes that pane only. */
async function closeButtons(page: Page, close: string, what: string) {
  const panes = await page.locator("section[data-pane]").evaluateAll((els: Element[]) => els.map(e => e.getAttribute("data-pane")!));
  assert.ok(panes.length >= 2, `${what}: panes open: ${panes.join()}`);
  for (const p of panes) assert.equal(await page.getByTestId(`button-close-${p}`).count(), 1, `${what}: ${p} has a close button`);
  await page.getByTestId(`button-close-${close}`).click();
  await page.getByTestId(`pane-${close}`).waitFor({ state: "detached", timeout: 10_000 });
  for (const p of panes.filter(p => p !== close && p !== "assistant")) {
    await page.getByTestId(`pane-${p}`).waitFor({ timeout: 10_000 }).catch(async () => {
      await page.screenshot({ path: path.join(shots, "dock-close-failed.png") });
      assert.fail(`${what}: closing ${close} closed ${p} too (open: ${panes.join()}; now: ${await page.locator("section[data-pane]").evaluateAll((els: Element[]) => els.map(e => e.getAttribute("data-pane")).join())})`);
    });
  }
  // It stays closed once the stored view catches up.
  await page.waitForTimeout(3000);
  const now = await page.locator("section[data-pane]").evaluateAll((els: Element[]) => els.map(e => e.getAttribute("data-pane")!));
  assert.ok(!now.includes(close), `${what}: ${close} came back after closing (now: ${now.join()})`);
  console.log(`${what}: close buttons on ${panes.join(", ")}; closed ${close}`);
}

/**
 * The owner's live layout (17 November): your secret goal over the leaderboard on the left, the lines in the middle, my
 * agents on the right, and the assistant in a full-width row below (when the room has AI); no act log.
 */
async function ownersLayout(page: Page, label: string) {
  const box = async (p: string) => { const l = page.getByTestId(`pane-${p}`); return await l.count() ? await l.boundingBox() as Box | null : null; };
  const [goal, race, lines, agents, assistant] = await Promise.all(["my-card", "race", "objects", "agents", "assistant"].map(box));
  assert.ok(goal && race && lines && agents, `${label}: the four top panes`);
  assert.equal(await page.getByTestId("pane-feed").count(), 0, `${label}: no act log by default`);
  assert.ok(Math.abs(goal.x - race.x) < 4 && race.y > goal.y, `${label}: the goal over the leaderboard`);
  assert.ok(lines.x > goal.x + goal.width - 4 && agents.x > lines.x + lines.width - 4, `${label}: goal | lines | agents`);
  if (assistant) {
    assert.ok(assistant.y >= lines.y + lines.height - 4 && assistant.width > 0.9 * (agents.x + agents.width - goal.x), `${label}: the assistant in a full-width row below`);
    console.log(`${label}: the owner's layout, the assistant ${Math.round(assistant.height)} px tall below`);
  } else console.log(`${label}: the owner's layout (no assistant in this room)`);
}

const dockText = (page: Page) => page.getByTestId("dock-desktop").getAttribute("data-dock") as Promise<string>;
/** The left column's weight in the live arrangement (the goal card's column). */
const leftColumn = (text: string) => Number(/column\(my-card [^)]*\) (\d+(?:\.\d+)?),/.exec(text)?.[1] ?? NaN);

const browser = await chromium.launch();
try {
  for (const [who, viewport] of [["admin", { width: 1920, height: 1080 }], ["carol", { width: 1280, height: 720 }]] as const) {
    const label = `${viewport.width}×${viewport.height}`;
    const { context, page, errors } = await signIn(browser, who, viewport);
    await practiceGame(page, 75);
    await page.getByTestId("dock-desktop").waitFor();
    await usable(page, ["overview", "my-card", "forge"], `${label} planning`);
    await page.screenshot({ path: path.join(shots, `dock-${viewport.width}-planning.png`) });
    if (who === "admin") await closeButtons(page, "overview", `${label} planning`);

    await page.getByTestId("button-summon-first").click();
    await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
    const startNow = page.getByTestId("button-start-world");
    if (await startNow.count()) { await startNow.click(); await startNow.click().catch(() => {}); }
    await page.getByTestId("text-phase").getByText("Running").waitFor({ timeout: 30_000 });
    await page.locator("[data-testid^=marks-line-]").first().waitFor({ timeout: 30_000 });
    await usable(page, ["my-card", "objects", "agents", "race"], `${label} live`);
    await ownersLayout(page, label);
    // The planning screen's panes (stored by "Summon my first agent") stay behind: no tabs in the live default.
    assert.ok(!(await dockText(page)).includes("|"), `${label}: no tabs when the world starts: ${await dockText(page)}`);
    await page.screenshot({ path: path.join(shots, `dock-${viewport.width}-live.png`) });
    console.log(`${label}: planning and live defaults usable: ${await dockText(page)}`);

    // A line's detail is an overlay (production's hover view): pointing at its face opens it over the list, leaving
    // closes it, a click pins it; the dock does not change and no One line pane opens.
    const liveDock = await dockText(page);
    const face = page.locator("[data-testid^=marks-line-]").first();
    await face.hover();
    const detail = page.getByTestId("object-hover-detail");
    await detail.getByTestId("line-expanded").waitFor({ timeout: 10_000 });
    await page.screenshot({ path: path.join(shots, `dock-${viewport.width}-hover.png`) });
    await page.mouse.move(2, 2);
    await detail.waitFor({ state: "detached", timeout: 5_000 });
    await face.click();
    await detail.getByTestId("line-expanded").waitFor({ timeout: 10_000 });
    await page.mouse.move(2, 2);
    await page.waitForTimeout(400);
    assert.ok(await detail.isVisible(), `${label}: a click pins the detail`);
    await page.keyboard.press("Escape");
    await detail.waitFor({ state: "detached", timeout: 5_000 });
    assert.equal(await page.getByTestId("pane-object").count(), 0, `${label}: no One line pane`);
    assert.equal(await dockText(page), liveDock, `${label}: the dock is unchanged`);
    // The overlay's "Try a change" opens What if on this line (it is put in focus, One line is not opened).
    await face.click();
    await detail.getByTestId("button-open-what-if").click();
    await page.getByTestId("pane-what-if").waitFor({ timeout: 15_000 });
    await page.getByTestId("pane-what-if").getByTestId("select-what-if-change").waitFor({ timeout: 15_000 });
    assert.equal(await page.getByTestId("what-if-empty").count(), 0, `${label}: What if has the line`);
    assert.equal(await page.getByTestId("pane-object").count(), 0, `${label}: still no One line pane`);
    await page.getByTestId("button-close-what-if").click();
    await page.getByTestId("pane-what-if").waitFor({ state: "detached", timeout: 10_000 });
    // The act log's "This line now" opens the same overlay.
    const moveLink = page.locator("[data-testid^=button-open-move-]").first();
    if (await moveLink.count()) {
      await moveLink.hover();
      await detail.getByTestId("line-expanded").waitFor({ timeout: 10_000 });
      await page.mouse.move(2, 2);
      await detail.waitFor({ state: "detached", timeout: 5_000 });
    }

    // A dragged gutter is the human's arrangement: stored for the room, and back after a reload.
    const before = await dockText(page);
    const sash = page.locator(".dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash").first();
    const s = await sash.boundingBox() as Box;
    await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
    await page.mouse.down();
    await page.mouse.move(s.x + s.width / 2 + 60, s.y + s.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction((b: string) => document.querySelector("[data-testid=dock-desktop]")?.getAttribute("data-dock") !== b, before, { timeout: 10_000 });
    const dragged = await dockText(page);
    assert.ok(leftColumn(dragged) > leftColumn(before) + 2, `the left column grew: ${before} → ${dragged}`);
    await page.waitForTimeout(1500);
    await page.reload();
    await page.getByTestId("pane-objects").waitFor({ timeout: 30_000 });
    const after = await dockText(page);
    assert.equal(after, dragged, "the arrangement is stored and comes back after a reload");
    console.log(`${label}: dragged and kept across a reload: ${after}`);
    // Maximise (v1): one pane over the others on this screen only, never stored; Escape brings the others back.
    await page.getByTestId("button-pane-menu-race").click();
    await page.getByTestId("button-maximise-pane-race").click();
    await page.locator("[data-testid=dock-desktop][data-maximised=race]").waitFor({ timeout: 5_000 });
    assert.ok(await page.getByTestId("pane-race").isVisible(), `${label}: the maximised pane shows`);
    assert.ok(!await page.getByTestId("pane-objects").isVisible(), `${label}: the others are behind it`);
    assert.equal(await dockText(page), after, `${label}: maximising stores nothing`);
    await page.keyboard.press("Escape");
    await page.locator("[data-testid=dock-desktop]:not([data-maximised])").waitFor({ timeout: 5_000 });
    assert.ok(await page.getByTestId("pane-objects").isVisible(), `${label}: Escape restores the others`);
    // The palette's row (v1's "Maximise or restore this pane"): the largest pane, then the others back.
    for (const want of ["[data-maximised]", ":not([data-maximised])"]) {
      await page.keyboard.press("Control+K");
      await page.getByTestId("input-palette").fill("Maximise");
      await page.getByTestId("row-palette-view.maximisePane").click();
      await page.locator(`[data-testid=dock-desktop]${want}`).waitFor({ timeout: 5_000 });
    }

    await page.getByTestId("text-phase").getByText("Ended").waitFor({ timeout: 120_000 });
    await page.getByTestId("pane-results").getByText(/You finished/).waitFor({ timeout: 20_000 });
    console.log(`${label}: ended dock: ${await dockText(page)}`);
    await usable(page, ["results", "my-card", "race"], `${label} ended`);
    await page.screenshot({ path: path.join(shots, `dock-${viewport.width}-ended.png`) });
    // Opening a pane never hides the one acted from: from Results, open the line-by-line list; Results stays in view.
    const endedDock = await dockText(page);
    await page.getByTestId("pane-results").getByTestId("button-line-by-line-results").click();
    await page.getByTestId("pane-objects").waitFor({ timeout: 15_000 });
    for (const p of ["results", "objects"]) {
      assert.ok(await page.getByTestId(`pane-${p}`).isVisible(), `${label}: ${p} in view after opening from Results: ${await dockText(page)}`);
    }
    assert.ok(await page.getByTestId("pane-results").getByText(/You finished/).first().isVisible(), `${label}: Results' headline still in view`);
    noneClosed(endedDock, await dockText(page), `${label} from Results`);
    console.log(`${label}: opened from Results, all in view: ${await dockText(page)}`);
    assert.deepEqual(errors, [], `${label}: page errors`);
    await context.close();
  }

  // The phone stays stacked; opening a pane from inside another adds it and scrolls to it.
  {
    const { context, page, errors } = await signIn(browser, "bob", { width: 390, height: 844 });
    await practiceGame(page, 45);
    await page.getByTestId("dock-stacked").waitFor();
    assert.equal(await page.getByTestId("dock-desktop").count(), 0, "no desktop dock on a phone");
    // The sticky row of pane names is opaque and drawn above what scrolls under it (round 7/03, #559's opened-phone):
    // half-legible text showed through a 95% background.
    const nav = await page.getByTestId("dock-jump").evaluate((el: Element) => ({ bg: getComputedStyle(el).backgroundColor, z: getComputedStyle(el).zIndex }));
    assert.doesNotMatch(nav.bg, /\/ 0?\.\d+\)$|,\s*0?\.\d+\)$/, `phone: the pane-name row is opaque: ${nav.bg}`);
    assert.ok(Number(nav.z) >= 10, `phone: the pane-name row is above the panes: z-index ${nav.z}`);
    const jumps = async () => (await page.locator("[data-testid^=button-jump-]").evaluateAll((els: Element[]) => els.map(e => e.getAttribute("data-testid")!.slice("button-jump-".length))));
    await closeButtons(page, "overview", "phone planning");
    await page.screenshot({ path: path.join(shots, "dock-phone-closed.png") });
    const first = await jumps();
    assert.ok(first.includes("forge") && first.includes("my-card"), first.join());
    await page.getByTestId("button-summon-first").click();
    await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
    const open = page.getByTestId("button-open-agents");
    if (await open.count()) {
      await open.click();
      await page.getByTestId("pane-agents").waitFor();
      const now = await jumps();
      for (const p of first) assert.ok(now.includes(p), `${p} stays after opening My agents: ${now.join()}`);
      assert.ok(now.includes("agents"), now.join());
      // Every pane name is on screen: the row wraps rather than running off the right edge (a persona walk missed three).
      for (const b of await page.locator("[data-testid^=button-jump-]").all()) {
        const r = await b.boundingBox() as Box;
        assert.ok(r.x >= 0 && r.x + r.width <= 390, `${await b.innerText()} is on screen (${r.x}–${r.x + r.width})`);
      }
      await page.waitForTimeout(800);   // the smooth scroll
      const box = await page.getByTestId("pane-agents").boundingBox() as Box;
      // Its top in the upper half, or (the last pane, shorter than the screen) the page scrolled to its end with it on screen.
      const atEnd = await page.getByTestId("dock-stacked").evaluate((el: Element) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
      assert.ok(box.y >= 0 && (box.y < 844 / 2 || atEnd && box.y + Math.min(box.height, 200) <= 844), `the phone scrolled to My agents (top at ${box.y}, at the end: ${atEnd})`);
      console.log(`phone: Open My agents kept ${now.join(", ")} and scrolled to it`);
    } else console.log("phone: SKIPPED Open My agents (the forge status offered no link)");
    await page.screenshot({ path: path.join(shots, "dock-phone.png") });
    assert.deepEqual(errors, [], "phone: page errors");
    await context.close();
  }
  console.log("v2-dock: ok");
} finally {
  await browser.close();
}
