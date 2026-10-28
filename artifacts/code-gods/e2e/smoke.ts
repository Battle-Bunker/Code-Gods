/**
 * Playwright smoke test of the engine UI (artifacts/code-gods) against the LIVE local engine: the Convex
 * local backend from `pnpm --filter @workspace/engine dev`, its stand-in OIDC provider and the mock AI
 * provider (CODE_GODS_AI_MOCK=1). The UI is built with the engine's Convex URL and uploaded to the
 * engine's static hosting, so the browser talks to the real site origin: cookie login, browser JWTs,
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
 * creates a room; bob and carol join; alice switches the next game to TypeScript / Int with a short
 * planning phase, adds a mock AI seat and approves an AI budget; bob chats; alice starts the game and
 * every viewer is taken to the game page, which updates live; alice ends it; the room history shows
 * it. Then the device page approves an `act` request made through POST /api/device/request (the
 * credential appears under "Your player apps" and is revoked), and an owner request needs the consent
 * checkbox. Needs Playwright with Chromium available to `require("playwright")`.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";

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
const results: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  results.push(name);
  console.log(`ok - ${name}`);
}

/** A signed-in browser context: /api/login → the stand-in OIDC identity picker → the session cookie. */
async function signIn(browser: any, who: "alice" | "bob" | "carol" | "admin", viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(`${who}: ${e.message}`));
  await page.goto(`${SITE}/api/login?returnTo=/`);
  await page.getByRole("link", { name: new RegExp(`\\(${who}\\)`) }).click();
  await page.waitForURL(`${SITE}/`);
  await page.getByTestId("button-logout").waitFor();
  return { context, page, errors };
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

const browser = await chromium.launch();
let failed = false;
try {
  for (const [name, viewport] of VIEWPORTS) {
    const alice = await signIn(browser, "alice", viewport);
    const bob = await signIn(browser, "bob", viewport);
    const carol = await signIn(browser, "carol", viewport);
    const a = alice.page, b = bob.page, c = carol.page;
    let code = "";

    await check(`${name}: alice creates a room; it shows its short code, owner and creation date (no name)`, async () => {
      await a.getByTestId("button-create-room").click();
      await a.waitForURL(/\/rooms\/[0-9A-Z]+$/);
      code = (await a.getByTestId("text-room-code").innerText()).trim();
      assert.match(code, /^[0-9A-Z]{4,}$/);
      assert.match(await a.getByTestId("text-room-owner").innerText(), /Alice Liddell/);
      assert.match(await a.getByTestId("text-room-created").innerText(), /\d{4}/);
      await a.goto(`${SITE}/`);
      const row = a.locator('[data-testid^="row-room-"]', { hasText: code });
      await row.waitFor();
      assert.match(await row.innerText(), /Owner: Alice Liddell \(you\)/);
      await shot(a, `home-${name}`);
      await noHorizontalScroll(a, `${name} home`);
      await row.click();
      await a.getByTestId("text-room-code").waitFor();
    });

    await check(`${name}: bob and carol join by code; alice's member list updates live`, async () => {
      for (const p of [b, c]) {
        await p.getByTestId("input-join-code").fill(code);
        await p.getByTestId("button-join-code").click();
        await p.getByTestId("button-join").click();
        await p.getByTestId("button-ready").waitFor();
      }
      await a.locator('[data-testid^="row-member-"]').nth(2).waitFor();
      const members = await a.locator('[data-testid^="row-member-"]').allInnerTexts();
      assert.ok(members.some(t => /Bob Okafor/.test(t)) && members.some(t => /Carol Nguyen/.test(t)), members.join(" | "));
      await b.getByTestId("button-ready").click();
      await a.getByTestId("row-member-test-bob").getByText("ready").waitFor();
    });

    await check(`${name}: alice switches the next game to TypeScript / Int with 1 s planning; bob sees it live`, async () => {
      await a.getByTestId("select-language").selectOption("typescript");
      await a.getByTestId("type-Int").click();
      await a.getByTestId("input-planningSeconds").fill("1");
      await a.getByTestId("button-save-settings").click();
      await a.getByTestId("button-save-settings").and(a.locator(":disabled")).waitFor();
      const listed = b.getByTestId("list-settings");
      await listed.filter({ hasText: "typescript" }).waitFor();
      assert.match(await listed.innerText(), /Int/);
    });

    await check(`${name}: alice adds a mock AI seat and approves an AI budget`, async () => {
      await a.getByTestId("text-ai-mock").waitFor();
      await a.getByTestId("button-add-ai").click();
      await a.locator('[data-testid^="row-member-ai:"]').waitFor();
      await b.locator('[data-testid^="row-member-ai:"]').waitFor();
      await a.getByTestId("input-ai-budget").fill("50000");
      await a.getByTestId("checkbox-approve-budget").check();
      await a.getByTestId("button-save-budget").click();
      await a.getByTestId("text-ai-usage").filter({ hasText: /\/ 50,000 used/ }).waitFor();
    });

    await check(`${name}: public chat reaches every member live`, async () => {
      await b.getByTestId("input-chat").fill(`Bob says hello (${name})`);
      await b.getByTestId("button-send-chat").click();
      await a.locator('[data-testid^="row-chat-"]', { hasText: `Bob says hello (${name})` }).waitFor();
      await c.locator('[data-testid^="row-chat-"]', { hasText: `Bob says hello (${name})` }).waitFor();
    });

    await check(`${name}: "Your player apps" explains connecting a Replit app and links the hosted client`, async () => {
      const panel = a.getByTestId("panel-player-apps");
      await panel.waitFor();
      assert.equal(await a.getByTestId("text-engine-url").innerText(), SITE);
      assert.equal(await a.getByTestId("text-connect-command").innerText(), `pnpm player connect --room ${code}`);
      assert.equal(await a.getByTestId("link-player").getAttribute("href"), `/player/?room=${code}`);
      await shot(a, `room-${name}`);
      await noHorizontalScroll(a, `${name} room`);
    });

    let gameCode = "";
    await check(`${name}: alice starts the game; every viewer is taken to the game page, which updates live`, async () => {
      await a.getByTestId("button-start").click();
      await a.waitForURL(/\/games\/[0-9A-Z]+$/, { timeout: 30_000 });
      await b.waitForURL(/\/games\/[0-9A-Z]+$/, { timeout: 30_000 });
      gameCode = (await a.getByTestId("text-game-code").innerText()).trim();
      assert.equal(await a.getByTestId("text-game-status").innerText(), "LIVE");
      // The world clock and the objects move without any reload or polling.
      const t0 = Number((await a.getByTestId("text-world-t").innerText()).replace(/[^\d.]/g, ""));
      await a.waitForFunction((t: number) => Number(document.querySelector('[data-testid="text-world-t"]')!.textContent!.replace(/[^\d.]/g, "")) > t + 0.5, t0, { timeout: 30_000 });
      await a.locator('[data-testid^="row-object-"]').first().waitFor({ timeout: 30_000 });
      await a.locator('[data-testid^="row-standing-"]').nth(3).waitFor();
      assert.equal(await a.locator('[data-testid^="row-roster-"]').count(), 4);
      assert.match(await b.getByTestId("text-viewer-seat").innerText(), /seated/);
      assert.doesNotMatch(await a.locator("main").innerText(), /value function/i);
      await shot(a, `game-${name}`);
      await noHorizontalScroll(a, `${name} game`);
    });

    await check(`${name}: the owner ends the game; every viewer sees the final result`, async () => {
      await a.getByTestId("button-end-game").click();
      await a.getByTestId("button-confirm-end-game").click();
      await a.getByTestId("panel-final-results").waitFor({ timeout: 30_000 });
      await b.getByTestId("panel-final-results").waitFor({ timeout: 30_000 });
      assert.equal(await a.getByTestId("text-game-status").innerText(), "ENDED");
      assert.match(await a.getByTestId("text-end-reason").innerText(), /ended by owner/);
      await shot(a, `game-${name}-ended`);
    });

    await check(`${name}: the room history shows the ended game`, async () => {
      await a.getByTestId("button-back-to-room").click();
      await a.waitForURL(new RegExp(`/rooms/${code}$`));
      await a.getByTestId(`link-game-${gameCode}`).waitFor();
      assert.match(await a.locator('[data-testid^="text-game-winners-"]').first().innerText(), /\w/);
    });

    await check(`${name}: the device page approves an act request; the credential is listed and revoked`, async () => {
      const req = await deviceRequest(code, "act", `e2e smoke app (${name})`);
      assert.equal(req.roomCode, code);
      assert.equal(new URL(req.verificationUrl).pathname, "/device");
      await c.goto(`${SITE}/device?code=${encodeURIComponent(req.userCode)}`);
      const panel = c.getByTestId("panel-device-details");
      await panel.waitFor();
      assert.equal(await c.getByTestId("text-device-code").innerText(), req.userCode);
      assert.match(await c.getByTestId("text-device-room").innerText(), new RegExp(`^${code} · `));
      assert.equal(await c.getByTestId("text-device-requester").innerText(), `e2e smoke app (${name})`);
      assert.match(await c.getByTestId("text-device-permission").innerText(), /^Act/);
      assert.match(await c.getByTestId("text-device-expiry").innerText(), /in \d+s/);
      assert.equal(await c.getByTestId("text-device-status").innerText(), "pending");
      await shot(c, `device-${name}`);
      await noHorizontalScroll(c, `${name} device`);
      assert.equal((await devicePoll(req)).status, 202, "pending before approval");
      await c.getByTestId("button-approve-device").click();
      await c.getByTestId("status-approved").waitFor();
      const claimed = await devicePoll(req);
      assert.equal(claimed.status, 200);
      assert.match(claimed.body.credential ?? "", /^cgc_/);
      await c.goto(`${SITE}/rooms/${code}`);
      const row = c.getByTestId(`row-credential-${claimed.body.credentialId}`);
      await row.waitFor();
      assert.match(await row.innerText(), /e2e smoke app/);
      assert.match(await row.innerText(), /act · room/i);
      await c.getByTestId(`button-revoke-${claimed.body.credentialId}`).click();
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

  await check("admin: the AI library is for admins only", async () => {
    const admin = await signIn(browser, "admin", { width: 1280, height: 900 });
    await admin.page.getByTestId("link-admin-agents").click();
    await admin.page.locator('[data-testid^="row-agent-"]').first().waitFor();
    assert.match(await admin.page.locator("main").innerText(), /Sonnet Strategist/);
    await shot(admin.page, "admin-agents-desktop");
    const alice = await signIn(browser, "alice", { width: 1280, height: 900 });
    await alice.page.goto(`${SITE}/admin/agents`);
    await alice.page.getByText("Admins only").waitFor();
    for (const who of [admin, alice]) { assert.deepEqual(who.errors, []); await who.context.close(); }
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
