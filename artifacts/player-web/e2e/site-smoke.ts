/**
 * Playwright smoke test of the app's site pages (artifacts/player-web src/site: home, room, configure, the game's
 * spectator view, /connect, /device, admin) against the LIVE local engine: the Convex
 * local backend from `pnpm --filter @workspace/engine dev`, its stand-in OIDC provider ("fake") and the mock AI
 * provider (AI_MOCK=1). The UI is built with the engine's Convex URL and uploaded to the
 * engine's static hosting, so the browser talks to the real site origin: Better Auth session cookie, Convex JWTs,
 * reactive queries, mutations, actions and the device flow, exactly as deployed.
 *
 *   pnpm --filter @workspace/engine dev                       (or let this script start it, see below)
 *   pnpm --filter @workspace/player-web run e2e:site
 *
 * Environment:
 *   CODE_GODS_SITE_URL      engine site URL (default http://127.0.0.1:$CONVEX_LOCAL_SITE_PORT, else :3211)
 *   SKIP_DEPLOY=1           reuse the app already uploaded to the site
 *   SHOTS_DIR               screenshots (default artifacts/player-web/e2e/shots, gitignored)
 * If the site does not answer, the script starts the engine itself (same port variables:
 * CONVEX_LOCAL_CLOUD_PORT, CONVEX_LOCAL_SITE_PORT, FAKE_OIDC_PORT) and stops it at the end.
 *
 * Scenario, at desktop and phone widths: alice (an administrator: AI is only available in rooms an administrator owns), bob and carol sign in (three browser contexts). Alice
 * creates a room in one click (no dialog), is seated as a player, and sees its AI quotas (300,000 tokens per game by default) on the room page; the page's one primary follows nextStep
 * (a practice game with AI players while she is alone, then Start game). Bob and carol open the room by code from the command palette and
 * join; alice searches the Setup combobox (a system setup's Edit is unavailable, with the reason), duplicates the
 * room's setup (put on First steps through the combobox: a new room runs Annotated basics) and edits the copy on /rooms/:code/configure (its name "First steps's copy" first; the board as
 * three controls with every playable value enabled; defence goals switched on with one unticked; goal
 * dealing, prior, act targeting, then Int(0,2147483647) / TypeScript, a range with no shipped tables whose first-use
 * note shows, with TypeScript ticked and Python unticked in the languages multi-select, 1 s planning), saves it for
 * the next game, and bob reads it under Details and as a read-only page offering "Duplicate and edit"; alice adds a mock AI player and changes the AI quotas in the
 * AI quotas sheet; bob chats; the palette explains connecting a player
 * app and shows owner commands dimmed to members; alice starts the game (at phone width on a setup with a two-minute
 * bid phase: bob and carol get the bidding screen, bob bids and takes it back, both pass and it ends; at desktop width
 * the walk passes through a bid phase only if the setup has one), the room shows its rule tables being
 * prepared (the computed cache of that range is forgotten first), and every viewer is then taken to the game page,
 * which updates live; alice ends it from the owner menu; the room's past games show it and the Setup combobox puts
 * the room on First steps at once, with Undo (then alice deletes her copy, so runs leave no setups behind). Then the device page approves an `act` request made through POST
 * /api/device/request (the credential appears under Connected apps and is revoked), and an owner request needs the
 * consent checkbox. Needs Playwright with Chromium available to `require("playwright")`.
 */
import "../../engine/scripts/local-only.mjs";   // refuses to run with CONVEX_DEPLOY_KEY set
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { instantiate, objectType } from "@workspace/game-types";
import { LENSES, applicable, canonicalSupport, context, familiesFor, family as familyOf, instantiateKey, paramsKey, tableKey } from "@workspace/game-utilities";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(import.meta.dirname, "../../..");
const SITE = (process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`).replace(/\/+$/, "");
const shots = process.env.SHOTS_DIR ?? path.join(import.meta.dirname, "shots");
mkdirSync(shots, { recursive: true });

// ---------------------------------------------------------------------------------------------
// The engine: reuse a running one, or start `pnpm --filter @workspace/engine dev`
// ---------------------------------------------------------------------------------------------
async function healthy() {
  try { return (await fetch(`${SITE}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}
let engine: ChildProcess | null = null;
if (!(await healthy())) {
  console.log(`# starting the engine (site ${SITE})`);
  const sitePort = new URL(SITE).port;
  engine = spawn("pnpm", ["--filter", "@workspace/engine", "dev"], {
    cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CONVEX_LOCAL_SITE_PORT: sitePort },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("engine did not become READY in 180 s")), 180_000);
    const watch = (chunk: Buffer) => { if (/\[dev\] READY/.test(String(chunk))) { clearTimeout(timer); resolve(); } };
    engine!.stdout!.on("data", watch);
    engine!.stderr!.on("data", watch);
    engine!.on("exit", code => { clearTimeout(timer); reject(new Error(`engine exited (${code})`)); });
  });
}
const stopEngine = () => { if (engine?.pid) { try { process.kill(-engine.pid, "SIGINT"); } catch { /* gone */ } } };

if (!process.env.SKIP_DEPLOY) {
  // Builds this UI with VITE_CONVEX_URL = the deployment's client URL and uploads it to the site at "/".
  const deploy = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: root, stdio: "inherit" });
  if (deploy.status !== 0) { stopEngine(); process.exit(deploy.status ?? 1); }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
type Page = any;
/** Run an internal engine function on the local deployment (test fixtures: calibration.cache, compute.run). */
function convexRun(fn: string, args: unknown) {
  const r = spawnSync("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: path.join(root, "artifacts/engine"), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${fn} failed: ${r.stderr}`);
}
/**
 * Forget the on-demand tables of an instantiation and claim every table the given reward families can need there, so
 * a start waits on them; returns the compute.run jobs that land them.
 */
function claimDealable(instance: string, families: string[]) {
  convexRun("calibration/cache:forget", { instance });
  const inst = instantiateKey(instance), ctx = context(inst);
  return families.flatMap(id => canonicalSupport(familiesFor(inst.objectType, "reward").find(f => f.id === id)!, ctx).map(p => {
    const key = tableKey(id, p, inst);
    convexRun("calibration/cache:claim", { key, instance, family: id, paramsKey: paramsKey(p), prior: "uniform" });
    return { key, instance, familyId: id, params: p };
  }));
}

/**
 * Change some of the room's next-game settings as its owner (the engine's owner.settings, with the page's own Convex
 * JWT): for settings a check needs without walking the configuration form again.
 */
const CLOUD = process.env.CG_TEST_CLOUD_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3210"}`;
async function ownerSettings(page: Page, room: string, settings: Record<string, unknown>) {
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  const state = await client.query("rooms:get" as never, { room } as never) as { id: string; revision: number };
  await client.action("owner:settings" as never, { roomId: state.id, revision: state.revision, settings } as never);
}
/**
 * A start on a setup with a bid phase (docs/bid-phase.md) shows the bidding screen first: every player passes, so the
 * deal is the dealer's own and the start goes on as without bidding. Returns false when the start had no bid phase.
 */
async function passIfBidding(owner: Page, players: Page[]) {
  const seen = (what: string, p: Promise<unknown>) => p.then(() => what, () => null);
  const first = await Promise.race([
    seen("bidding", owner.getByTestId("panel-bidding").waitFor({ timeout: 60_000 })),
    seen("preparing", owner.getByTestId("panel-preparing").waitFor({ timeout: 60_000 })),
    seen("game", owner.waitForURL(/\/games\/[0-9A-Z]+$/, { timeout: 60_000 })),
  ]);
  if (first !== "bidding") return false;
  for (const p of players) await p.getByTestId("button-bidding-done").click();
  return true;
}

const results: string[] = [];
/** Every signed-in page, so a failed check can show what each one was showing. */
const open: { who: string; page: any; consoleErrors: string[] }[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    const views: string[] = [];
    for (const { who, page, consoleErrors } of open) {
      if (page.isClosed()) continue;
      await page.screenshot({ path: `${shots}/failed-${who}.png` }).catch(() => {});
      const body = await page.locator("body").innerText({ timeout: 2000 }).catch(() => "(unreadable)");
      views.push(`--- ${who} at ${page.url()}\n${body.slice(0, 800)}\nconsole errors:\n${consoleErrors.slice(-5).join("\n")}`);
    }
    // A new error: Node prints the stack, which holds the message as it was when the error was made.
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${views.join("\n")}`, { cause: error });
  }
  results.push(name);
  console.log(`ok - ${name}`);
}

/**
 * A signed-in browser context. The UI's button goes to Google, which a local deployment cannot use, so the
 * page starts Better Auth's test-only provider "fake" itself (same origin, as the button would), then the
 * stand-in OIDC identity picker → /api/auth/oauth2/callback/fake → the session cookie → back to "/".
 */
async function signIn(browser: any, who: "alice" | "bob" | "carol" | "admin", viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(`${who}: ${e.message}`));
  // An error boundary's caught error reaches the console only: keep it for the failure message.
  const consoleErrors: string[] = [];
  page.on("console", (m: { type(): string; text(): string }) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 600)); });
  open.push({ who: `${who}-${viewport.width}`, page, consoleErrors });
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
  // The god id (member row ids) is the Better Auth user id.
  const subject = await page.evaluate(async () => ((await (await fetch("/api/auth/get-session")).json()) as { user: { id: string } }).user.id);
  return { context, page, errors, subject };
}

async function noHorizontalScroll(page: Page, label: string) {
  const { sw, iw, wide } = await page.evaluate(() => {
    const iw = window.innerWidth;
    const wide = [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > iw + 0.5 && ![...el.children].some(c => c.getBoundingClientRect().right > iw + 0.5))
      .slice(0, 5).map(el => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right)}px`);
    return { sw: document.documentElement.scrollWidth, iw, wide };
  });
  assert.ok(sw <= iw, `${label}: page scrolls horizontally (${sw}px wide in a ${iw}px viewport): ${wide.join("; ")}`);
}

const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage });

/** POST /api/device/request as a player app would (`pnpm player connect`), PKCE S256. */
async function deviceRequest(room: string, permission: "read" | "act" | "owner", label: string) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const r = await fetch(`${SITE}/api/device/request`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge, room, permission, label }),
  });
  assert.equal(r.status, 200, `device request: ${r.status} ${await r.clone().text()}`);
  const body = await r.json() as { deviceId: string; deviceSecret: string; userCode: string; verificationUrl: string; roomCode: string };
  return { ...body, verifier };
}
const lastPoll = new Map<string, number>();
/** POST /api/device/poll, honouring the 2 s interval (a faster poll gets 429 slow_down). */
async function devicePoll(d: { deviceId: string; deviceSecret: string; verifier: string }) {
  const wait = (lastPoll.get(d.deviceId) ?? 0) + 2100 - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastPoll.set(d.deviceId, Date.now());
  const r = await fetch(`${SITE}/api/device/poll`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: d.deviceId, deviceSecret: d.deviceSecret, verifier: d.verifier }),
  });
  return { status: r.status, body: await r.json() as { status: string; credential?: string; credentialId?: string } };
}

const VIEWPORTS = [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]] as const;

/** Opens the command palette, types a query and runs the first row (Enter). */
async function palette(page: Page, query: string) {
  await page.getByTestId("button-palette").click();
  await page.getByTestId("dialog-palette").waitFor();
  await page.getByTestId("input-palette").fill(query);
  await page.keyboard.press("Enter");
}
/** The row ids the open palette lists (empty query), after opening it by `how`; closes it again. */
async function paletteItems(page: Page, how: "search box" | "menu button" | "ctrl+k"): Promise<string[]> {
  if (how === "search box") await page.getByTestId("button-palette").click();
  else if (how === "menu button") {
    // On a phone the one "Menu" control is the search box; on a desktop ☰ is its own button.
    const menu = page.getByTestId("button-palette-menu");
    await ((await menu.isVisible()) ? menu : page.getByTestId("button-palette")).click();
  } else await page.keyboard.press("Control+k");
  await page.getByTestId("dialog-palette").waitFor();
  const rows = page.locator('[data-testid^="row-palette-"]');
  await rows.first().waitFor();
  const ids = (await rows.evaluateAll(els => els.map(e => e.getAttribute("data-testid")!))).sort();
  await page.keyboard.press("Escape");
  await page.getByTestId("dialog-palette").waitFor({ state: "hidden" });
  return ids;
}
/** Opens a collapsed section (a <details> with this test id). */
async function expand(page: Page, testId: string) {
  const details = page.getByTestId(testId);
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator("summary").first().click();
}

const browser = await chromium.launch();
let failed = false;
try {
  for (const [name, viewport] of VIEWPORTS) {
    const alice = await signIn(browser, "admin", viewport);   // AI is only available in rooms an administrator owns
    const bob = await signIn(browser, "bob", viewport);
    const carol = await signIn(browser, "carol", viewport);
    const a = alice.page, b = bob.page, c = carol.page;
    let code = "";

    await check(`${name}: alice creates a room in one click, then changes the assistant quota; it shows its code, owner and creation date (no name)`, async () => {
      // One click makes the room and opens it, ready to share: nothing is asked first, even with AI configured (mock).
      await a.getByTestId("button-create-room").click();
      await a.waitForURL(/\/rooms\/[0-9A-Z]+$/);
      await a.getByTestId("button-copy-link").waitFor();
      // The room's AI quotas start at 300,000 tokens per game for the AI players and for each player's assistant; the owner changes them in a sheet.
      await a.getByTestId("text-ai-quotas").filter({ hasText: /Assistant: 300,000 per player/ }).waitFor();
      await a.getByTestId("button-ai-quotas").click();
      await a.getByTestId("sheet-ai-quotas").waitFor();
      assert.equal(await a.getByTestId("input-assistant-quota").inputValue(), "300000");
      await a.getByTestId("input-assistant-quota").fill("200000");
      await a.getByTestId("button-save-ai-quotas").click();
      await a.getByTestId("text-ai-quotas").filter({ hasText: /Assistant: 200,000 per player/ }).waitFor();
      await a.keyboard.press("Escape");
      await a.getByTestId("sheet-ai-quotas").waitFor({ state: "hidden" });
      code = (await a.getByTestId("text-room-code").innerText()).trim();
      assert.match(code, /^[0-9A-Z]{4,}$/);
      assert.match(await a.getByTestId("text-room-owner").innerText(), /Ada Admin/);
      assert.match(await a.getByTestId("text-room-created").innerText(), /\d{4}/);
      // nextStep: the owner plays (rooms.create seats them). Alone in a room with AI players, the one primary is a
      // practice game against them, with the invite link beside it. The owner may still watch instead, and play again.
      assert.match(await a.getByTestId("text-viewer-seat").innerText(), /A game needs three players\. Play a practice game against practice partners, or invite friends\./);
      assert.match(await a.getByTestId("button-practice-game").innerText(), /Play a practice game with two AI players/);
      assert.match(await a.getByTestId(`text-member-seat-${alice.subject}`).innerText(), /owner · player/);
      await a.getByTestId(`button-spectator-${alice.subject}`).click();
      await a.getByTestId("text-viewer-seat").filter({ hasText: /3 more players needed; you're watching\. AI players count\./ }).waitFor();
      await a.waitForTimeout(400);   // the play/watch toggle drops the second click of a double click (click-once.ts)
      await a.getByTestId(`button-spectator-${alice.subject}`).click();
      await a.getByTestId("text-viewer-seat").filter({ hasText: /A game needs three players/ }).waitFor();
      await a.goto(`${SITE}/`);
      const row = a.locator('[data-testid^="row-room-"]', { hasText: code });
      await row.waitFor();
      assert.match(await row.innerText(), /Owner: Ada Admin \(you\)/);
      assert.match(await row.innerText(), /Created: .*\d{4}/);
      await shot(a, `home-${name}`);
      await noHorizontalScroll(a, `${name} home`);
      await row.click();
      await a.getByTestId("text-room-code").waitFor();
    });

    await check(`${name}: bob and carol open the room by code from the palette and join; alice's player list updates live`, async () => {
      for (const p of [b, c]) {
        await palette(p, code);   // a code-shaped query: "Open room CODE" is the first row
        await p.waitForURL(new RegExp(`/rooms/${code}$`));
        await p.getByTestId("button-join").click();
        await p.getByTestId(`row-member-${p === b ? bob.subject : carol.subject}`).waitFor();
      }
      await a.locator('[data-testid^="row-member-"]').nth(2).waitFor();
      const members = await a.locator('[data-testid^="row-member-"]').allInnerTexts();
      assert.ok(members.some(t => /Bob Okafor/.test(t)) && members.some(t => /Carol Nguyen/.test(t)), members.join(" | "));
      // Ready gates nothing, so it is a text link beside the status, never a player's filled button.
      assert.match(await b.getByTestId("text-viewer-seat").innerText(), /Waiting for Ada to start the game\./);
      await b.getByTestId("button-ready").click();
      await a.getByTestId(`row-member-${bob.subject}`).getByText("ready").waitFor();
      await a.getByTestId("button-start").waitFor();   // three players: Start is the owner's one primary now
    });

    let copyId = "", copyName = "";
    await check(`${name}: the Setup combobox searches every setup; a system setup's Edit is unavailable; Duplicate opens the copy`, async () => {
      // A new room runs Annotated basics; alice puts it on First steps through the combobox first (searched on the engine).
      await a.getByTestId("text-current-setup").filter({ hasText: /^Annotated basics$/ }).waitFor();
      await a.getByTestId("select-setup").click();
      await a.getByTestId("input-setup-search").fill("first steps");
      await a.locator('[data-testid^="row-setup-"]', { hasText: /^First steps · System/ }).click();
      await a.getByTestId("text-current-setup").filter({ hasText: /^First steps$/ }).waitFor();
      await a.getByTestId("select-setup").click();
      await a.getByTestId("popover-setups").waitFor();
      await a.getByTestId("input-setup-search").fill("classic");
      const classic = a.locator('[data-testid^="row-setup-"]', { hasText: /^Classic · System/ });
      await classic.waitFor();
      assert.ok(!(await a.locator('[data-testid^="row-setup-"]', { hasText: /^First steps/ }).count()), "the search filters by name");
      const edit = classic.locator('[data-testid^="button-edit-setup-"]');
      assert.equal(await edit.getAttribute("aria-disabled"), "true", "nobody edits a system setup");
      await edit.hover();
      await a.getByRole("tooltip").filter({ hasText: "System setups cannot be edited: duplicate it" }).first().waitFor();
      await a.getByTestId("input-setup-search").fill("system");
      await a.locator('[data-testid^="row-setup-"]', { hasText: /^First steps \(current\) · System/ }).waitFor();
      await shot(a, `setups-combobox-${name}`, false);
      // Duplicate the room's current setup: the copy is alice's own, and the configuration page opens on it.
      await a.locator('[data-testid^="row-setup-"]', { hasText: /^First steps/ }).locator('[data-testid^="button-duplicate-setup-"]').click();
      await a.waitForURL(new RegExp(`/rooms/${code}/configure\\?setup=`));
      copyId = new URL(a.url()).searchParams.get("setup")!;
      await a.getByTestId("page-configure").waitFor();
      copyName = await a.getByTestId("input-setup-name").inputValue();
      assert.match(copyName, /^First steps's copy( \d+)?$/);
    });

    await check(`${name}: alice edits her copy: name first, three board controls, defence goals for everyone, every engine choice; bob sees it live`, async () => {
      // The name is the form's first field, above the World section.
      const nameBox = await a.getByTestId("field-name").boundingBox(), worldBox = await a.getByTestId("section-world").boundingBox();
      assert.ok(nameBox && worldBox && nameBox.y < worldBox.y, "the name comes first");
      assert.equal(await a.getByTestId("select-typeArgs").count(), 0, "no combined shape dropdown");
      // First steps is Grid(4,base10,rgb): every size 4–7 is playable (tables are prepared on demand), none disabled.
      await a.getByTestId("choice-arg-size-5").waitFor({ timeout: 120_000 });   // a fresh engine boots both sandboxes on the first manifest.node.warm
      for (const size of [4, 5, 6, 7]) assert.equal(await a.getByTestId(`choice-arg-size-${size}`).isDisabled(), false, `${size}×${size} is playable`);
      assert.equal(await a.getByTestId("reasons-size").count(), 0, "nothing to explain");
      assert.equal(await a.getByTestId("note-first-use").count(), 0, "every Grid shape is shipped: no first-use note");
      for (const id of ["choice-arg-symbols-cards", "choice-arg-colours-rgby", "choice-arg-colours-mono"]) await a.getByTestId(id).waitFor();
      assert.equal(await a.getByTestId("choice-arg-colours-mono").isDisabled(), false, "the numbers-only board is playable");
      await a.getByTestId("choice-arg-size-5").click();
      assert.equal(await a.getByTestId("choice-arg-size-5").getAttribute("aria-checked"), "true");
      assert.equal(await a.getByTestId("choice-arg-symbols-base10").getAttribute("aria-checked"), "true", "the other arguments did not move");
      await shot(a, `configure-top-${name}`, false);
      await noHorizontalScroll(a, `${name} configure`);
      // Goals: the selector, defence goals as a switch with a checklist of the allowed ones, the prior.
      await a.getByTestId("choice-utilitySelectorId-divine-lottery").click();
      assert.equal(await a.getByTestId("checklist-defence").count(), 0, "the checklist belongs to the switch");
      await a.getByTestId("switch-defenceGoals").click();
      const allowed = a.getByTestId("text-defence-allowed");
      await allowed.waitFor();
      const [, total] = (await allowed.innerText()).match(/^(\d+) of (\d+)$/)!.map(Number);
      await a.locator('[data-testid^="check-defence-"]').first().uncheck();
      assert.equal(await allowed.innerText(), `${total - 1} of ${total}`);
      await expand(a, "more-goals");
      await a.getByTestId("field-penaltyWeight").waitFor();
      assert.equal(await a.getByTestId("select-priorId").isDisabled(), false);
      assert.ok((await a.getByTestId("select-priorId").locator("option").allInnerTexts()).some(t => /Uniformly random/.test(t)));
      await a.getByTestId("section-goals").screenshot({ path: path.join(shots, `configure-goals-${name}.png`) });
      await expand(a, "more-population");
      await a.getByTestId("choice-objectSelection-shelter").click();
      assert.equal(await a.getByTestId("select-spawnFunctionId").isDisabled(), false);
      await expand(a, "more-agents");
      await a.getByTestId("switch-commitClause").click();
      // Int / TypeScript: Int's own arguments; the languages are a multi-select that never empties.
      await a.getByTestId("choice-objectType-Int").click();
      await a.getByTestId("arg-min").waitFor();
      await a.getByTestId("arg-max").waitFor();
      // A range with no shipped tables (it used to be disabled): playable, with the first game's preparation noted.
      await a.getByTestId("choice-arg-min-0").click();
      assert.equal(await a.getByTestId("choice-arg-max-2147483647").getAttribute("aria-checked"), "true");
      await a.getByTestId("note-first-use").filter({ hasText: /first game on this shape on this server prepares up to \d+ rule tables \(about 35 s\)/ }).waitFor();
      // Only rules with sampled tables may be dealt, so the first game here must prepare (an all-analytic deal starts at once).
      for (const id of ["digit-devotee", "tailwright", "firstborn", "power-hoarder", "palindromist", "stairwalker", "residue-oracle", "bit-sigil", "zebra", "numerologist", "refrain"]) {
        await a.getByTestId(`toggle-family-${id}`).uncheck();
      }
      // Int has no defence goals: nothing switches them off behind alice's back; the field says so, and she does.
      await a.getByTestId("error-defenceGoals").filter({ hasText: /no defence goals to deal/ }).waitFor();
      await a.getByTestId("switch-defenceGoals").click();
      await a.getByTestId("reason-defenceGoals").waitFor();
      assert.equal(await a.getByTestId("switch-defenceGoals").isDisabled(), true);
      assert.equal(await a.getByTestId("choice-languages-python").isDisabled(), true, "the only allowed language cannot be unticked");
      await a.getByTestId("choice-languages-typescript").click();
      await a.getByTestId("text-summary-languages").filter({ hasText: "Python, TypeScript" }).waitFor();
      await a.getByTestId("choice-languages-python").click();
      assert.equal(await a.getByTestId("choice-languages-typescript").getAttribute("aria-checked"), "true");
      assert.equal(await a.getByTestId("choice-languages-python").getAttribute("aria-checked"), "false");
      await a.getByTestId("button-exact-planningSeconds").click();
      await a.getByTestId("input-planningSeconds").fill("0.02");   // minutes (1.2 s), so the game runs at once
      await a.getByTestId("choice-durationMode-fixed").click();
      await a.getByTestId("button-exact-halfLifeSeconds").click();
      await a.getByTestId("input-halfLifeSeconds").fill("7");
      assert.equal(await a.getByTestId("choice-durationMode-fixed").getAttribute("aria-checked"), "true");
      await a.getByTestId("text-unsaved").filter({ hasText: /unsaved changes/ }).waitFor();
      await a.getByTestId("button-save-settings").click();
      await a.waitForURL(new RegExp(`/rooms/${code}$`));
      await a.getByTestId("text-current-setup").filter({ hasText: copyName }).waitFor({ timeout: 15_000 });
      await expand(b, "details-next-game");
      const listed = b.getByTestId("list-settings");
      await listed.filter({ hasText: "typescript" }).waitFor();
      assert.match(await listed.innerText(), /Whole numbers/);
      await b.getByTestId("text-setup").filter({ hasText: copyName }).waitFor();
      // Anyone else reads the same page, every control disabled, with "Duplicate and edit" as the one action.
      await b.goto(`${SITE}/rooms/${code}/configure`);
      await b.getByTestId("page-configure").waitFor();
      assert.equal(await b.getByTestId("input-setup-name").inputValue(), copyName);
      assert.equal(await b.getByTestId("input-setup-name").isDisabled(), true);
      assert.equal(await b.getByTestId("button-save-settings").count(), 0, "read-only for anyone but its owner");
      await b.getByTestId("button-duplicate-and-edit").waitFor();
      assert.match(await b.getByTestId("text-setup-owner").innerText(), /Ada Admin's setup: only Ada Admin can edit it/);
      await b.goto(`${SITE}/rooms/${code}`);
      await b.getByTestId("text-room-code").waitFor();
    });

    await check(`${name}: alice adds a mock AI player with no approval step`, async () => {
      // One plain button seats the default AI player; which AI is a choice behind "Choose a model" (the palette's pick list).
      await a.getByTestId("button-choose-ai").click();
      await a.locator('[data-testid^="row-palette-option-"]').first().waitFor();
      // Escape leaves the pick list for the palette's first page, then closes the palette.
      for (let i = 0; i < 3 && await a.getByTestId("dialog-palette").isVisible(); i++) { await a.keyboard.press("Escape"); await a.waitForTimeout(200); }
      await a.getByTestId("dialog-palette").waitFor({ state: "hidden" });
      await a.getByTestId("button-add-ai").click();
      await a.locator('[data-testid^="row-member-ai:"]').waitFor();
      await b.locator('[data-testid^="row-member-ai:"]').waitFor();
      // The seat has its own name (lib/aiNames.ts), not its template's; its row menu's tooltip stays on-screen.
      assert.doesNotMatch(await a.locator('[data-testid^="row-member-ai:"]').first().innerText(), /Sonnet Strategist/);
      await a.locator('[data-testid^="button-ai-menu-"]').first().hover();
      const tip = await a.locator('[data-radix-popper-content-wrapper]:has([role="tooltip"])').first().boundingBox();
      assert.ok(tip && tip.x >= 0 && tip.x + tip.width <= viewport.width, `the remove tooltip fits the viewport: ${JSON.stringify(tip)}`);
      await a.mouse.move(0, 0);
      // The AI quotas live in a sheet reached from the room page.
      await a.getByTestId("button-ai-quotas").click();
      await a.getByTestId("text-ai-mock").waitFor();
      await a.getByTestId("input-ai-quota").fill("50000");
      await a.getByTestId("button-save-ai-quotas").click();
      await a.getByTestId("text-ai-usage").filter({ hasText: /\/ 50,000 used/ }).waitFor();
      await a.keyboard.press("Escape");
    });

    await check(`${name}: public chat reaches every member live`, async () => {
      await b.getByTestId("input-chat").fill(`Bob says hello (${name})`);
      await b.getByTestId("button-send-chat").click();
      await a.locator('[data-testid^="row-chat-"]', { hasText: `Bob says hello (${name})` }).waitFor();
      await c.locator('[data-testid^="row-chat-"]', { hasText: `Bob says hello (${name})` }).waitFor();
    });

    await check(`${name}: the palette explains connecting a player app; searching shows owner commands dimmed for members`, async () => {
      await palette(a, "connect a player app");
      const info = a.getByTestId("panel-palette-info");
      await info.waitFor();
      assert.match(await info.innerText(), new RegExp(`CODE_GODS_ENGINE_URL to ${SITE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      assert.match(await info.innerText(), new RegExp(`pnpm player connect --room ${code}`));
      await a.keyboard.press("Escape");
      await a.keyboard.press("Escape");
      await b.getByTestId("button-palette").click();
      await b.getByTestId("input-palette").fill("end game");
      const row = b.getByTestId("row-palette-rooms.endActiveGame");
      await row.waitFor();
      assert.equal(await row.getAttribute("data-unavailable"), "true", "dimmed, with the reason in the detail line");
      await b.keyboard.press("Escape");
      // One palette: the search box, the menu button and Ctrl+K list exactly the same commands.
      const viaBox = await paletteItems(a, "search box");
      assert.ok(viaBox.length > 12, `the whole list, not a curated few (${viaBox.length})`);
      assert.deepEqual(await paletteItems(a, "menu button"), viaBox, "menu button = search box");
      assert.deepEqual(await paletteItems(a, "ctrl+k"), viaBox, "Ctrl+K = search box");
      await shot(a, `room-${name}`);
      await noHorizontalScroll(a, `${name} room`);
    });

    let gameCode = "";
    // The phone run starts with a bid phase (docs/bid-phase.md), the desktop run with the setup as it is: both ways into a game.
    const withBidding = name === "phone";
    let pending: ReturnType<typeof claimDealable> = [];
    await check(`${name}: alice starts the game; the Start button reads "Starting…" in the same frame`, async () => {
      if (withBidding) {
        await ownerSettings(a, code, { bidSeconds: 120 });
      }
      // So this run's first game on the range prepares again, and deterministically: every table its deal can need is
      // claimed first (as if computing elsewhere), so the room waits until this script runs the compute actions.
      pending = claimDealable("Int(0,2147483647)", ["many-faced", "smooth-operator", "truncation-saint"]);
      // The click registers in the same frame: by the next animation frame the button reads "Starting…" and refuses a
      // second click, before the start action (a Node action) has answered.
      await a.evaluate(() => document.querySelector('[data-testid="button-start"]')!.addEventListener("click", () => requestAnimationFrame(() => {
        const b = document.querySelector('[data-testid="button-start"]');
        (window as unknown as { startFrame: unknown }).startFrame = { text: b?.textContent, disabled: b?.getAttribute("aria-disabled") };
      }), { once: true }));
      // Alice watches this game (spectator): bob, carol and the AI player play it.
      await a.getByTestId(`button-spectator-${alice.subject}`).click();
      await a.getByTestId(`text-member-seat-${alice.subject}`).filter({ hasText: /spectator/ }).waitFor();
      await a.getByTestId("button-start").click();
      await a.waitForFunction(() => (window as unknown as { startFrame?: unknown }).startFrame);
      assert.deepEqual(await a.evaluate(() => (window as unknown as { startFrame: unknown }).startFrame), { text: "Starting…", disabled: "true" });
    });

    if (withBidding) await check(`${name}: the start opens the bidding screen: players bid or pass with one button, the spectating owner watches the clock and may cancel; when every player has passed it ends`, async () => {
      for (const p of [b, c]) await p.getByTestId("button-bidding-done").filter({ hasText: /^Pass$/ }).waitFor({ timeout: 60_000 });
      assert.equal(await b.getByTestId("text-bidding-title").innerText(), "Bid for your rule");
      assert.match(await b.getByTestId("bidding-countdown-value").innerText(), /^[0-2]:\d\d$/);
      assert.match(await b.getByTestId("text-bidding-example").innerText(), /If nobody bids, rules are dealt at random as usual\./);
      assert.equal(await b.getByTestId("text-viewer-seat").innerText(), "Bidding: bid for the rule you want, or pass.");
      // The owner watches this game: the clock and Cancel, no bids; the Start button is gone (the start is under way).
      await a.getByTestId("panel-bidding").waitFor();
      assert.equal(await a.getByTestId("panel-bidding").getAttribute("data-seated"), "false");
      assert.equal(await a.getByTestId("text-bidding-title").innerText(), "The players are bidding for their rules");
      assert.equal(await a.getByTestId("text-viewer-seat").innerText(), "Bidding: the players are bidding for their rules.");
      await a.getByTestId("button-cancel-bidding").waitFor();
      assert.equal(await a.getByTestId("button-start").count(), 0, "no second start while the players bid");
      assert.equal(await a.locator('[data-testid^="bid-family-"]').count(), 0, "a spectator has nothing to bid on");
      // Bob bids 10% on the first rule (the button now finishes instead of passing), then takes it back.
      const family = (await b.locator('[data-testid^="bid-family-"]').first().getAttribute("data-testid"))!.replace("bid-family-", "");
      await b.getByTestId(`chip-bid-${family}-10`).click();
      await b.getByTestId(`text-bid-${family}`).filter({ hasText: "10%" }).waitFor();
      await b.getByTestId("button-bidding-done").filter({ hasText: /^Done bidding$/ }).waitFor();
      assert.match(await b.getByTestId("text-your-bids").innerText(), /10%/);
      await shot(b, `room-bidding-${name}`, false);
      await noHorizontalScroll(b, `${name} bidding`);
      await b.getByTestId(`button-bid-remove-${family}`).click();
      await b.getByTestId("button-bidding-done").filter({ hasText: /^Pass$/ }).waitFor();
      // One click passes; the last pass ends the bid phase for everyone at once (long before its two minutes are up).
      await b.getByTestId("button-bidding-done").click();
      await b.getByTestId("text-bidding-done").filter({ hasText: "You passed. Waiting for 1 more player…" }).waitFor();
      await b.getByTestId("button-bidding-change").waitFor();
      await c.getByTestId("button-bidding-done").click();
      for (const p of [a, b, c]) await p.getByTestId("panel-bidding").waitFor({ state: "detached", timeout: 30_000 });
    });
    // A start without the check above still passes through a bid phase its setup may have (nobody bids).
    else await passIfBidding(a, [b, c]);

    await check(`${name}: the room prepares its rule tables, then every viewer is taken to the game page, which updates live`, async () => {
      // A shape with no shipped tables: everyone in the room sees the progress until the last table lands.
      await b.getByTestId("text-preparing").filter({ hasText: /The game is preparing its rule tables, \d+ of \d+ ready/ }).waitFor({ timeout: 30_000 });
      await a.getByTestId("panel-preparing").waitFor();
      await shot(a, `room-preparing-${name}`);
      for (const job of pending) convexRun("calibration/compute:run", job);   // the real per-table action; finished() launches the game
      // Games are nested in their room's URL; one page, calibrated to the viewer: alice watches, bob plays (his dock).
      await a.waitForURL(new RegExp(`/rooms/${code}/games/[0-9A-Z]+$`), { timeout: 480_000 });
      await b.waitForURL(new RegExp(`/rooms/${code}/games/[0-9A-Z]+$`), { timeout: 30_000 });
      gameCode = (await a.getByTestId("text-game-code").innerText()).trim();
      await b.getByTestId("dock").waitFor({ timeout: 60_000 });
      assert.equal(await b.getByTestId("text-game-code").count(), 0, "a player gets the player view, not the spectator view");
      await a.getByTestId("text-game-status").waitFor({ timeout: 30_000 });
      assert.equal(await a.getByTestId("text-game-status").innerText(), "LIVE");
      // The world clock and the objects move without any reload or polling (the clock is under Game details).
      const t0 = Number((await a.getByTestId("text-world-t").textContent()).replace(/[^\d.]/g, ""));
      await a.waitForFunction((t: number) => Number(document.querySelector('[data-testid="text-world-t"]')!.textContent!.replace(/[^\d.]/g, "")) > t + 0.5, t0, { timeout: 30_000 });
      await a.locator('[data-testid^="row-object-"]').first().waitFor({ timeout: 30_000 });
      assert.equal(await a.locator('[data-testid^="row-standing-"]').count(), 3, "the leaderboard lists every seated player (not the spectating owner)");
      assert.match(await a.getByTestId("text-viewer-seat").innerText(), /watching/);
      assert.doesNotMatch(await a.locator("main").innerText(), /value function/i);
      await shot(a, `game-${name}`);
      await noHorizontalScroll(a, `${name} game`);
    });

    await check(`${name}: the owner ends the game from the ⋯ menu; the same page becomes its replay for both`, async () => {
      await a.getByTestId("button-owner-menu").click();
      await a.getByTestId("button-end-game").click();
      await a.getByTestId("button-confirm-end-game").click();
      // The spectating owner and the player stay on the game's URL, which is now its replay.
      for (const page of [a, b]) {
        await page.getByTestId("input-replay-scrub").waitFor({ timeout: 60_000 });
        assert.match(page.url(), new RegExp(`/rooms/${code}/games/${gameCode}`));
        assert.equal(await page.getByTestId("button-owner-menu").count(), 0, "no End game menu after the end");
      }
      // Opened again once its file is stored, the replay is one download from the engine's /api/replay route,
      // authorised by the player's JWT (never a storage URL, which anyone with the link could read).
      let downloaded: { status: number; auth: string | null } | null = null;
      for (let tries = 0; !downloaded && tries < 20; tries++) {
        const response = b.waitForResponse(r => r.url().includes("/api/replay/"), { timeout: 5_000 }).catch(() => null);
        await b.reload();
        const r = await response;
        if (r) downloaded = { status: r.status(), auth: await r.request().headerValue("authorization") };
      }
      assert.ok(downloaded, "the stored replay was downloaded");
      assert.equal(downloaded.status, 200);
      assert.match(downloaded.auth ?? "", /^Bearer \S+/);
      await b.getByTestId("input-replay-scrub").waitFor({ timeout: 60_000 });
      await shot(a, `game-${name}-ended`);
    });

    await check(`${name}: the room's past games show the ended game; the Setup combobox applies a setup at once, with Undo`, async () => {
      await a.getByTestId("link-room").first().click();
      await a.waitForURL(new RegExp(`/rooms/${code}$`));
      await expand(a, "section-past-games");
      await a.getByTestId(`link-game-${gameCode}`).waitFor();
      assert.equal(await a.getByTestId(`link-game-${gameCode}`).getAttribute("href"), `/rooms/${code}/games/${gameCode}`);
      // No legacy links: an old game link is not found (the owner, 2026-11-02: no backwards compatibility).
      await a.goto(`${SITE}/games/${gameCode}`);
      await a.getByTestId("text-not-found").waitFor();
      await a.goto(`${SITE}/rooms/${code}`);
      await a.getByTestId(`link-game-${gameCode}`).waitFor();
      assert.match(await a.locator('[data-testid^="text-game-winners-"]').first().innerText(), /\w/);
      const current = a.getByTestId("text-current-setup");
      await current.filter({ hasText: copyName }).waitFor();
      await a.getByTestId("select-setup").click();
      await a.getByTestId("input-setup-search").fill("first steps");
      await a.locator('[data-testid^="row-setup-"]', { hasText: /^First steps · System/ }).click();
      await current.filter({ hasText: /^First steps$/ }).waitFor({ timeout: 30_000 });
      await a.getByTestId("text-next-game-summary").filter({ hasText: /^First steps:/ }).waitFor();
      await a.getByTestId("button-undo-setup").click();
      await current.filter({ hasText: copyName }).waitFor({ timeout: 30_000 });
      // Leave no setups behind on the shared deployment: alice deletes her copy; the room keeps its settings.
      await a.goto(`${SITE}/rooms/${code}/configure?setup=${encodeURIComponent(copyId)}`);
      await a.getByTestId("button-delete-setup").click();
      await a.getByTestId("button-delete-setup").click();
      await a.waitForURL(new RegExp(`/rooms/${code}$`));
      await current.filter({ hasText: `${copyName} (deleted)` }).waitFor({ timeout: 15_000 });
      // New setup on a deleted setup keeps the room's settings as alice's own setup (then deleted again: no leftovers).
      await a.getByTestId("select-setup").click();
      await a.getByTestId("button-new-setup").click();
      await a.getByTestId("panel-deleted-setup").waitFor();
      await a.getByTestId("button-keep-deleted-setup").click();
      await a.waitForURL(new RegExp(`/rooms/${code}/configure\\?setup=`));
      assert.match(await a.getByTestId("input-setup-name").inputValue(), /'s copy/);
      await a.getByTestId("button-delete-setup").click();
      await a.getByTestId("button-delete-setup").click();
      await a.waitForURL(new RegExp(`/rooms/${code}$`));
    });

    await check(`${name}: the device page approves an act request; the credential is listed under Connected apps and revoked`, async () => {
      const req = await deviceRequest(code, "act", `e2e smoke app (${name})`);
      assert.equal(req.roomCode, code);
      assert.equal(new URL(req.verificationUrl).pathname, "/device");
      await c.goto(`${SITE}/device?code=${encodeURIComponent(req.userCode)}`);
      const panel = c.getByTestId("panel-device-details");
      await panel.waitFor();
      assert.equal(await c.getByTestId("text-device-code").innerText(), req.userCode);
      assert.match(await c.getByTestId("text-device-room").innerText(), new RegExp(`^${code}\\b`));
      assert.equal(await c.getByTestId("text-device-requester").innerText(), `e2e smoke app (${name})`);
      assert.match(await c.getByTestId("text-device-permission").innerText(), /^Act/);
      assert.match(await c.getByTestId("text-device-expiry").innerText(), /in \d+:\d\d/);
      assert.equal(await c.getByTestId("text-device-status").textContent(), "pending");
      await shot(c, `device-${name}`);
      await noHorizontalScroll(c, `${name} device`);
      assert.equal((await devicePoll(req)).status, 202, "pending before approval");
      await c.getByTestId("button-approve-device").click();
      await c.getByTestId("status-approved").waitFor();
      const claimed = await devicePoll(req);
      assert.equal(claimed.status, 200);
      assert.match(claimed.body.credential ?? "", /^cgc_/);
      await c.goto(`${SITE}/rooms/${code}`);
      await c.getByTestId("button-avatar").click();
      await c.getByTestId("menu-connected-apps").click();
      const row = c.getByTestId(`row-credential-${claimed.body.credentialId}`);
      await row.waitFor();
      assert.match(await row.innerText(), /e2e smoke app/);
      assert.match(await row.innerText(), /act · room/i);
      await c.getByTestId(`button-revoke-${claimed.body.credentialId}`).click();
      await c.getByTestId(`button-revoke-${claimed.body.credentialId}`).click();   // inline confirmation
      await row.waitFor({ state: "detached" });
      const token = await fetch(`${SITE}/api/device/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: claimed.body.credential }) });
      assert.equal(token.status, 401, "a revoked credential no longer gets tokens");
    });

    await check(`${name}: an owner grant needs the owner's explicit consent`, async () => {
      const req = await deviceRequest(code, "owner", "e2e owner assistant");
      await c.goto(`${SITE}/device?code=${encodeURIComponent(req.userCode)}`);
      await c.getByTestId("text-device-owner-required").waitFor();
      assert.ok(await c.getByTestId("button-approve-device").isDisabled(), "a non-owner cannot approve an owner grant");
      await a.goto(`${SITE}/device?code=${encodeURIComponent(req.userCode)}`);
      await a.getByTestId("checkbox-device-owner-consent").waitFor();
      assert.ok(await a.getByTestId("button-approve-device").isDisabled(), "approval waits for consent");
      await a.getByTestId("checkbox-device-owner-consent").check();
      await a.getByTestId("button-approve-device").click();
      await a.getByTestId("status-approved").waitFor();
      assert.equal((await devicePoll(req)).body.status, "approved");
    });

    for (const who of [alice, bob, carol]) {
      assert.deepEqual(who.errors, []);
      await who.context.close();
    }
  }

  await check("admin: the AI library is for admins only, reached from the avatar menu", async () => {
    const admin = await signIn(browser, "admin", { width: 1280, height: 900 });
    await admin.page.getByTestId("button-avatar").click();
    await admin.page.getByTestId("link-admin-agents").click();
    await admin.page.locator('[data-testid^="row-agent-"]').first().waitFor();
    assert.match(await admin.page.locator("main").innerText(), /Sonnet Strategist/);
    await shot(admin.page, "admin-agents-desktop");
    const alice = await signIn(browser, "alice", { width: 1280, height: 900 });
    await alice.page.goto(`${SITE}/admin/agents`);
    await alice.page.getByText("Admins only").waitFor();
    for (const who of [admin, alice]) { assert.deepEqual(who.errors, []); await who.context.close(); }
  });

  await check("rule gallery: a board's annotated families as tiles; a tile's link opens its family page with the board and params", async () => {
    const alice = await signIn(browser, "alice", { width: 1280, height: 900 });
    const p = alice.page;
    await p.getByTestId("link-rule-gallery").click();
    await p.getByTestId("list-rule-families").waitFor();
    // Every family with a lens (the registry) that the gallery's default board can deal, in registry order.
    const defaultBoard = instantiate("Grid", objectType("Grid").defaults);
    const annotated = LENSES.map(l => l.familyId).filter(id => familyOf(id).role === "reward" && applicable(familyOf(id), defaultBoard).ok);
    assert.ok(annotated.length >= 9, `the lens registry has the annotated families (${annotated.length})`);
    assert.deepEqual(await p.locator('[data-testid^="tile-"]').evaluateAll(els => els.map(e => e.getAttribute("data-testid")!.slice("tile-".length))),
      annotated, "one tile per family with a lens, in the registry's order");
    assert.equal(await p.getByTestId("source-picture_frame").getAttribute("open"), null, "source starts collapsed");
    await p.getByTestId("select-setup-size").selectOption("6");
    await p.waitForURL(/size=6/);
    // A labelled colour picker (named swatches), never "X: 0/1/2".
    await p.getByTestId("colour-param-picture_frame-colour").getByText("Your colour").waitFor();
    await p.getByTestId("colour-picture_frame-colour-green").click();
    await p.getByTestId("select-param-picture_frame-symbol").selectOption("7");
    assert.match(await p.getByTestId("text-summary-picture_frame").innerText(), /green and your symbol is the number 7/, "the description follows both params");
    const link = p.getByTestId("link-family-picture_frame");
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.equal(await link.getAttribute("href"), "/rule-gallery/picture_frame?size=6&symbols=base10&colours=rgb&colour=green&symbol=7");
    await shot(p, "rule-gallery-desktop");
    const [family] = await Promise.all([alice.context.waitForEvent("page"), link.click()]);
    await family.getByTestId("goal-card").waitFor();
    assert.equal(await family.getByTestId("select-setup-size").inputValue(), "6");
    assert.equal(await family.getByTestId("colour-picture_frame-colour-green").getAttribute("aria-checked"), "true");
    assert.equal(await family.getByTestId("select-param-picture_frame-symbol").inputValue(), "7");
    await family.getByTestId("example-object").waitFor();
    await shot(family, "rule-family-desktop");
    assert.deepEqual(alice.errors, []);
    await alice.context.close();
  });

  await check("sign-in goes to Google; sign-out (avatar menu) returns to the landing page", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    // Never leave the machine: answer Google's authorization endpoint locally and record the request.
    await context.route(/^https:\/\/accounts\.google\.com\//, (route: any) => route.fulfill({ status: 200, contentType: "text/html", body: "google" }));
    // Nothing may register a beforeunload guard: the Convex client's "changes may not be saved" prompt used to
    // fire when the sign-in redirect left the page while the manifest action was still in flight.
    await context.addInitScript(() => {
      const w = window as unknown as { __beforeunloadListeners: number };
      w.__beforeunloadListeners = 0;
      const add = window.addEventListener.bind(window);
      window.addEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === "beforeunload") w.__beforeunloadListeners += 1;
        return (add as (...a: unknown[]) => void)(type, ...rest);
      }) as typeof window.addEventListener;
    });
    await page.goto(`${SITE}/`);
    await page.getByTestId("button-login").waitFor();
    // The Convex client registers its guard when it is constructed, so the count is final once the page is up.
    assert.equal(await page.evaluate(() => (window as unknown as { __beforeunloadListeners: number }).__beforeunloadListeners), 0, "a beforeunload guard was registered; leaving for Google would prompt \"Leave site?\"");
    const google = page.waitForRequest(/^https:\/\/accounts\.google\.com\//);
    await page.getByTestId("button-login").click();
    const url = new URL((await google).url());
    assert.equal(url.searchParams.get("redirect_uri"), `${SITE}/api/auth/callback/google`);
    assert.equal(url.searchParams.get("prompt"), "select_account");
    // Sign-in is required for everything (owner decision 2026-11-02): every path shows the one sign-in screen, in place.
    for (const path of ["/rooms/ZZZZZZ", "/rooms/ZZZZZZ/configure", "/device?code=ABCD-EFGH", "/admin/agents"]) {
      await page.goto(`${SITE}${path}`);
      await page.getByTestId("button-login").waitFor();
      assert.equal(new URL(page.url()).pathname, path.split("?")[0], `the signed-out page at ${path} moved`);
    }
    await context.close();

    const carol = await signIn(browser, "carol", { width: 1280, height: 900 });
    await carol.page.getByTestId("button-avatar").click();
    await carol.page.getByTestId("button-logout").click();
    await carol.page.getByTestId("button-login").waitFor();
    await carol.page.reload();
    await carol.page.getByTestId("button-login").waitFor();
    assert.deepEqual(carol.errors, []);
    await carol.context.close();
  });
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  stopEngine();
}
console.log(`\n${results.length} checks passed${failed ? ", then one FAILED" : ""}. Screenshots: ${shots}`);
process.exit(failed ? 1 : 0);
