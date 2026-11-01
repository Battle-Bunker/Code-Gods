/**
 * Playwright smoke test of the engine UI (artifacts/code-gods) against the LIVE local engine: the Convex
 * local backend from `pnpm --filter @workspace/engine dev`, its stand-in OIDC provider ("fake") and the mock AI
 * provider (AI_MOCK=1). The UI is built with the engine's Convex URL and uploaded to the
 * engine's static hosting, so the browser talks to the real site origin: Better Auth session cookie, Convex JWTs,
 * reactive queries, mutations, actions and the device flow, exactly as deployed.
 *
 *   pnpm --filter @workspace/engine dev                       (or let this script start it, see below)
 *   pnpm --filter @workspace/code-gods run e2e
 *
 * Environment:
 *   CODE_GODS_SITE_URL      engine site URL (default http://127.0.0.1:$CONVEX_LOCAL_SITE_PORT, else :3211)
 *   SKIP_DEPLOY=1           reuse the engine UI already uploaded to the site
 *   SHOTS_DIR               screenshots (default artifacts/code-gods/e2e/shots, gitignored)
 * If the site does not answer, the script starts the engine itself (same port variables:
 * CONVEX_LOCAL_CLOUD_PORT, CONVEX_LOCAL_SITE_PORT, FAKE_OIDC_PORT) and stops it at the end.
 *
 * Scenario, at desktop and phone widths: alice, bob and carol sign in (three browser contexts). Alice
 * creates a room in one click (no dialog) and turns the assistant on from the room page; the page's one primary follows nextStep
 * (Copy invite link, then Start game). Bob and carol open the room by code from the command palette and
 * join; alice searches the Setup combobox (a system setup's Edit is unavailable, with the reason), duplicates the
 * room's First steps and edits the copy on /rooms/:code/configure (its name "First steps's copy" first; the board as
 * three controls with every playable value enabled; defence goals switched on with one unticked; goal
 * dealing, prior, act targeting, then Int(0,2147483647) / TypeScript, a range with no shipped tables whose first-use
 * note shows, with TypeScript ticked and Python unticked in the languages multi-select, 1 s planning), saves it for
 * the next game, and bob reads it under Details and as a read-only page offering "Duplicate and edit"; alice adds a mock AI player, which asks for the AI budget in the
 * same step, and changes the budget in the AI spending sheet; bob chats; the palette explains connecting a player
 * app and shows owner commands dimmed to members; alice starts the game, the room shows its rule tables being
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
import { canonicalSupport, context, familiesFor, instantiateKey, paramsKey, tableKey } from "@workspace/game-utilities";

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
  const deploy = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static", "--only", "engine"], { cwd: root, stdio: "inherit" });
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

const results: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  await fn();
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
/** Opens a collapsed section (a <details> with this test id). */
async function expand(page: Page, testId: string) {
  const details = page.getByTestId(testId);
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator("summary").first().click();
}

const browser = await chromium.launch();
let failed = false;
try {
  for (const [name, viewport] of VIEWPORTS) {
    const alice = await signIn(browser, "alice", viewport);
    const bob = await signIn(browser, "bob", viewport);
    const carol = await signIn(browser, "carol", viewport);
    const a = alice.page, b = bob.page, c = carol.page;
    let code = "";

    await check(`${name}: alice creates a room in one click, then turns the assistant on; it shows its code, owner and creation date (no name)`, async () => {
      // One click makes the room and opens it, ready to share: nothing is asked first, even with AI configured (mock).
      await a.getByTestId("button-create-room").click();
      await a.waitForURL(/\/rooms\/[0-9A-Z]+$/);
      await a.getByTestId("button-copy-link").waitFor();
      // The assistant is off until the owner turns it on from the room page (pre-filled, with consent).
      await a.getByTestId("text-ai-spending").filter({ hasText: /Assistant: off/ }).waitFor();
      await a.getByTestId("button-ai-spending").filter({ hasText: "Turn on…" }).click();
      await a.getByTestId("sheet-ai-spending").waitFor();
      assert.equal(await a.getByTestId("input-assistant-budget").inputValue(), "200000");
      assert.ok(await a.getByTestId("button-save-assistant-budget").isDisabled(), "consent first");
      await a.getByTestId("checkbox-approve-assistant").check();
      await a.getByTestId("button-save-assistant-budget").click();
      await a.getByTestId("text-ai-spending").filter({ hasText: /Assistant: 200,000 per player/ }).waitFor();
      await a.keyboard.press("Escape");
      await a.getByTestId("sheet-ai-spending").waitFor({ state: "hidden" });
      code = (await a.getByTestId("text-room-code").innerText()).trim();
      assert.match(code, /^[0-9A-Z]{4,}$/);
      assert.match(await a.getByTestId("text-room-owner").innerText(), /Alice Liddell/);
      assert.match(await a.getByTestId("text-room-created").innerText(), /\d{4}/);
      // nextStep: alone, the owner's one primary is the invite link; AI players count.
      assert.match(await a.getByTestId("text-viewer-seat").innerText(), /2 more players needed\. AI players count\./);
      await a.goto(`${SITE}/`);
      const row = a.locator('[data-testid^="row-room-"]', { hasText: code });
      await row.waitFor();
      assert.match(await row.innerText(), /Owner: Alice Liddell \(you\)/);
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
        await p.getByTestId("button-ready").waitFor();
      }
      await a.locator('[data-testid^="row-member-"]').nth(2).waitFor();
      const members = await a.locator('[data-testid^="row-member-"]').allInnerTexts();
      assert.ok(members.some(t => /Bob Okafor/.test(t)) && members.some(t => /Carol Nguyen/.test(t)), members.join(" | "));
      // A member's primary is the player client; "Mark me ready" is a secondary link.
      assert.equal(await b.getByTestId("link-player").getAttribute("href"), `/player/?room=${code}`);
      await b.getByTestId("button-ready").click();
      await a.getByTestId(`row-member-${bob.subject}`).getByText("ready").waitFor();
      await a.getByTestId("button-start").waitFor();   // three players: Start is the owner's one primary now
    });

    let copyId = "", copyName = "";
    await check(`${name}: the Setup combobox searches every setup; a system setup's Edit is unavailable; Duplicate opens the copy`, async () => {
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
      // First steps is Grid(4,base10,ryb): every size 4–7 is playable (tables are prepared on demand), none disabled.
      await a.getByTestId("choice-arg-size-5").waitFor({ timeout: 120_000 });   // a fresh engine boots both sandboxes on the first manifest.get
      for (const size of [4, 5, 6, 7]) assert.equal(await a.getByTestId(`choice-arg-size-${size}`).isDisabled(), false, `${size}×${size} is playable`);
      assert.equal(await a.getByTestId("reasons-size").count(), 0, "nothing to explain");
      assert.equal(await a.getByTestId("note-first-use").count(), 0, "every Grid shape is shipped: no first-use note");
      for (const id of ["choice-arg-symbols-cards", "choice-arg-colours-rgby"]) await a.getByTestId(id).waitFor();
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
      await a.getByTestId("input-planningSeconds").fill("1");
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
      assert.match(await b.getByTestId("text-setup-owner").innerText(), /Alice Liddell's setup: only Alice Liddell can edit it/);
      await b.goto(`${SITE}/rooms/${code}`);
      await b.getByTestId("text-room-code").waitFor();
    });

    await check(`${name}: alice adds a mock AI player; the first one asks for the AI budget in the same step`, async () => {
      await a.getByTestId("button-add-ai").click();   // opens the palette on its pick list
      await a.locator('[data-testid^="row-palette-option-"]').first().click();
      await a.getByTestId("dialog-ai-budget").waitFor();
      assert.equal(await a.getByTestId("input-dialog-ai-budget").inputValue(), "300000");
      await a.getByTestId("checkbox-dialog-ai-budget").check();
      await a.getByTestId("button-dialog-approve-ai").click();
      await a.locator('[data-testid^="row-member-ai:"]').waitFor();
      await b.locator('[data-testid^="row-member-ai:"]').waitFor();
      // The seat has its own name (lib/aiNames.ts), not its template's; its row menu's tooltip stays on-screen.
      assert.doesNotMatch(await a.locator('[data-testid^="row-member-ai:"]').first().innerText(), /Sonnet Strategist/);
      await a.locator('[data-testid^="button-ai-menu-"]').first().hover();
      const tip = await a.locator('[data-radix-popper-content-wrapper]:has([role="tooltip"])').first().boundingBox();
      assert.ok(tip && tip.x >= 0 && tip.x + tip.width <= viewport.width, `the remove tooltip fits the viewport: ${JSON.stringify(tip)}`);
      await a.mouse.move(0, 0);
      // AI spending lives in a sheet reached from Details.
      await expand(a, "details-next-game");
      await a.getByTestId("button-ai-spending").click();
      await a.getByTestId("text-ai-mock").waitFor();
      await a.getByTestId("input-ai-budget").fill("50000");
      await a.getByTestId("checkbox-approve-budget").check();
      await a.getByTestId("button-save-budget").click();
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
      await shot(a, `room-${name}`);
      await noHorizontalScroll(a, `${name} room`);
    });

    let gameCode = "";
    await check(`${name}: alice starts the game; the room prepares its rule tables, then every viewer is taken to the game page, which updates live`, async () => {
      // So this run's first game on the range prepares again, and deterministically: every table its deal can need is
      // claimed first (as if computing elsewhere), so the room waits until this script runs the compute actions.
      const pending = claimDealable("Int(0,2147483647)", ["many-faced", "smooth-operator", "truncation-saint"]);
      // The click registers in the same frame: by the next animation frame the button reads "Starting…" and refuses a
      // second click, before the start action (a Node action) has answered.
      await a.evaluate(() => document.querySelector('[data-testid="button-start"]')!.addEventListener("click", () => requestAnimationFrame(() => {
        const b = document.querySelector('[data-testid="button-start"]');
        (window as unknown as { startFrame: unknown }).startFrame = { text: b?.textContent, disabled: b?.getAttribute("aria-disabled") };
      }), { once: true }));
      await a.getByTestId("button-start").click();
      await a.waitForFunction(() => (window as unknown as { startFrame?: unknown }).startFrame);
      assert.deepEqual(await a.evaluate(() => (window as unknown as { startFrame: unknown }).startFrame), { text: "Starting…", disabled: "true" });
      // A shape with no shipped tables: everyone in the room sees the progress until the last table lands.
      await b.getByTestId("text-preparing").filter({ hasText: /The game is preparing its rule tables, \d+ of \d+ ready/ }).waitFor({ timeout: 30_000 });
      await a.getByTestId("panel-preparing").waitFor();
      await shot(a, `room-preparing-${name}`);
      for (const job of pending) convexRun("calibration/compute:run", job);   // the real per-table action; finished() launches the game
      await a.waitForURL(/\/games\/[0-9A-Z]+$/, { timeout: 480_000 });
      await b.waitForURL(/\/games\/[0-9A-Z]+$/, { timeout: 30_000 });
      gameCode = (await a.getByTestId("text-game-code").innerText()).trim();
      assert.equal(await a.getByTestId("text-game-status").innerText(), "LIVE");
      // The world clock and the objects move without any reload or polling (the clock is under Game details).
      const t0 = Number((await a.getByTestId("text-world-t").textContent()).replace(/[^\d.]/g, ""));
      await a.waitForFunction((t: number) => Number(document.querySelector('[data-testid="text-world-t"]')!.textContent!.replace(/[^\d.]/g, "")) > t + 0.5, t0, { timeout: 30_000 });
      await a.locator('[data-testid^="row-object-"]').first().waitFor({ timeout: 30_000 });
      assert.equal(await a.locator('[data-testid^="row-standing-"]').count(), 4, "the leaderboard lists every seated player");
      assert.match(await b.getByTestId("text-viewer-seat").innerText(), /playing/);
      assert.equal(await a.getByTestId("link-player").getAttribute("href"), `/player/?room=${code}`);
      assert.doesNotMatch(await a.locator("main").innerText(), /value function/i);
      await shot(a, `game-${name}`);
      await noHorizontalScroll(a, `${name} game`);
    });

    await check(`${name}: the owner ends the game from the ⋯ menu; every viewer sees the final result`, async () => {
      await a.getByTestId("button-owner-menu").click();
      await a.getByTestId("button-end-game").click();
      await a.getByTestId("button-confirm-end-game").click();
      await a.getByTestId("panel-final-results").waitFor({ timeout: 30_000 });
      await b.getByTestId("panel-final-results").waitFor({ timeout: 30_000 });
      assert.equal(await a.getByTestId("text-game-status").innerText(), "ENDED");
      assert.match(await a.getByTestId("text-end-reason").textContent(), /ended by owner/);
      await shot(a, `game-${name}-ended`);
    });

    await check(`${name}: the room's past games show the ended game; the Setup combobox applies a setup at once, with Undo`, async () => {
      await a.getByTestId("button-back-to-room").click();
      await a.waitForURL(new RegExp(`/rooms/${code}$`));
      await expand(a, "section-past-games");
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
