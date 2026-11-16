/**
 * The old account-mode scenario (archive/engine-v1 e2e/account-mode.ts), ported to the v2 app: the app on another
 * origin (src/core/connection.ts), built with VITE_CODE_GODS_ENGINE_URL and served from localhost while the engine is
 * 127.0.0.1:<site port>. The human approves an account grant on the engine's /connect page (explicit consent) and the
 * app is then them everywhere: Alice creates a room, plays in it, starts the game and gets her game page, all from the
 * other origin. The consent pages stay on the engine's site, Sign out revokes the grant, and no request from the app
 * to the engine carries a cookie.
 *
 *   pnpm --filter @workspace/engine dev
 *   pnpm --filter @workspace/player-web run e2e:v1-account-mode          (~2 min: it builds the app in account mode)
 *
 * v2 changed: Bob and Carol join through their own browsers (v1: engine helpers); Start asks for confirmation; the owner
 * ends the game from the game bar's owner menu.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { SITE, chromium, check, clientOf, missing, report, signIn, watch, type Page, type Player } from "./v1-harness.ts";

const HERE = join(import.meta.dirname, "..");
const dist = mkdtempSync(join(tmpdir(), "cg-account-"));
console.log(`# building the app in account mode against ${SITE}`);
execFileSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"], { cwd: HERE, stdio: "inherit", env: { ...process.env, VITE_CODE_GODS_ENGINE_URL: SITE } });

// A plain static host on localhost (another origin than the engine's 127.0.0.1): files, else the app's index.html.
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path === "/frame.html") { res.setHeader("content-type", "text/html"); res.end(`<!doctype html><iframe id="app" style="width:900px;height:700px" src="/"></iframe>`); return; }
  const asset = join(dist, path);
  const file = asset.startsWith(dist) && path !== "/" && existsSync(asset) ? asset : join(dist, "index.html");
  res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
});
await new Promise<void>(r => server.listen(0, "localhost", r));
const APP = `http://localhost:${(server.address() as { port: number }).port}`;

const browser = await chromium.launch();
const everyone: Player[] = [];
try {
  // Alice's browser is signed in on the engine's site (its cookie), as a person who has used the site.
  const alice = await signIn(browser, "alice", { width: 1280, height: 900 });
  const bob = await signIn(browser, "bob", { width: 1280, height: 900 });
  const carol = await signIn(browser, "carol", { width: 1280, height: 900 });
  everyone.push(alice, bob, carol);
  const page = await alice.context.newPage();
  page.setDefaultTimeout(15_000);
  watch(page);
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  const cookieSent: string[] = [];
  page.on("request", (r: any) => {
    if (r.url().startsWith(SITE) && ["fetch", "xhr"].includes(r.resourceType()) && r.frame().url().startsWith(APP) && r.headers().cookie) cookieSent.push(r.url());
  });
  let code = "", gameUrl = "";
  /**
   * Waits for the page's requests to the engine to finish before the next navigation. A navigation during the app's
   * token refresh signs the player out (a bug, reported 16 Nov: the server rotates the refresh token, the page leaves
   * before storing the new one, and the reuse revokes the grant); the last check below proves it.
   */
  const settle = async (p: Page) => { await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(1_000); };
  /** The account grant again, through the engine's /connect with consent (after the bug above signed the app out). */
  async function approve() {
    await Promise.all([page.waitForURL((u: URL) => u.href.startsWith(`${SITE}/connect`), { timeout: 30_000 }), page.getByTestId("button-account-sign-in").click()]);
    await page.getByTestId("panel-connect-account").waitFor({ timeout: 60_000 });
    await page.getByTestId("checkbox-connect-account-consent").click();
    await Promise.all([page.waitForURL((u: URL) => u.href.startsWith(APP), { timeout: 30_000 }), page.getByTestId("button-approve-connect").click()]);
    await page.getByTestId("button-avatar").waitFor({ timeout: 30_000 });
  }

  await check("signed out, the app offers to sign in on the engine; inside a frame, to open in a tab of its own", async () => {
    await page.goto(`${APP}/`);
    await page.getByTestId("button-account-sign-in").waitFor({ timeout: 30_000 });
    assert.match(await page.getByTestId("screen-account-sign-in").innerText(), new RegExp(new URL(SITE).host.replace(/\./g, "\\.")));
    const framed = await alice.context.newPage();
    await framed.goto(`${APP}/frame.html`);
    await framed.frameLocator("#app").getByTestId("link-open-in-tab").waitFor({ timeout: 30_000 });
    await framed.close();
  });

  await check("denied on the engine's /connect: back on the app's sign-in screen, which says so", async () => {
    await Promise.all([page.waitForURL((u: URL) => u.href.startsWith(`${SITE}/connect`), { timeout: 30_000 }), page.getByTestId("button-account-sign-in").click()]);
    await page.getByTestId("panel-connect-account").waitFor({ timeout: 60_000 });
    await Promise.all([page.waitForURL((u: URL) => u.href.startsWith(APP), { timeout: 30_000 }), page.getByTestId("button-deny-connect").click()]);
    await page.getByTestId("text-sign-in-error").waitFor({ timeout: 30_000 });
    await page.getByTestId("button-account-sign-in").waitFor();
    assert.ok(!page.url().includes("state="), `the answer is stripped from the URL: ${page.url()}`);
  });

  await check("the account grant needs the human's explicit consent on the engine's /connect, then the app is them", async () => {
    await Promise.all([page.waitForURL((u: URL) => u.href.startsWith(`${SITE}/connect`), { timeout: 30_000 }), page.getByTestId("button-account-sign-in").click()]);
    await page.getByTestId("panel-connect-account").waitFor({ timeout: 60_000 });
    assert.equal(await page.getByTestId("text-connect-redirect").textContent(), "localhost", "the consent page names the app's origin");
    assert.equal(await page.getByTestId("button-approve-connect").isDisabled(), true, "never approved without the box ticked");
    await page.getByTestId("checkbox-connect-account-consent").click();
    await Promise.all([page.waitForURL((u: URL) => u.href.startsWith(APP), { timeout: 30_000 }), page.getByTestId("button-approve-connect").click()]);
    await page.getByTestId("button-create-room").first().waitFor({ timeout: 30_000 });
    assert.ok(!page.url().includes("code="), `the code is stripped from the URL: ${page.url()}`);
    assert.equal(await page.getByTestId("button-avatar").getAttribute("aria-label"), "Account: Alice Liddell");
  });

  await check("from the other origin Alice creates a room, plays in it and starts the game: the game page is hers", async () => {
    await page.getByTestId("button-create-room").first().click();
    await page.waitForURL(/\/rooms\/[0-9A-Z]+$/, { timeout: 30_000 });
    code = (await page.getByTestId("text-room-code").innerText()).trim();
    for (const p of [bob, carol]) {
      await p.page.goto(`${SITE}/rooms/${code}`);
      await p.page.getByTestId("button-join-room").click({ timeout: 30_000 });
    }
    await page.locator('[data-testid^="text-member-seat-"]', { hasText: /owner · player/ }).waitFor();
    await page.locator('[data-testid^="row-member-"]').nth(2).waitFor({ timeout: 30_000 });
    await page.getByTestId("button-start-game").click();
    const ok = page.getByTestId("button-start-game-confirm-ok");
    if (await ok.waitFor({ timeout: 3_000 }).then(() => true, () => false)) await ok.click();
    await page.waitForURL(new RegExp(`/rooms/${code}/games/[^/?#]+$`), { timeout: 120_000 });
    await page.getByTestId("text-phase").waitFor({ timeout: 60_000 });
    await page.getByTestId("button-summon-first").waitFor({ timeout: 60_000 });
    assert.ok(page.url().startsWith(APP), "still on the app's origin");
    gameUrl = page.url();
  });

  await check("a reload keeps the grant (stored per engine) without visiting the engine's pages again", async () => {
    await settle(page);
    await page.reload();
    await page.getByTestId("text-phase").waitFor({ timeout: 60_000 });
    assert.ok(page.url().startsWith(APP));
  });

  await check("the consent and admin pages link to the engine's site instead", async () => {
    await settle(page);
    await page.goto(`${APP}/device`);
    const link = page.getByTestId("link-site-page");
    await link.waitFor({ timeout: 30_000 });
    assert.equal(await link.getAttribute("href"), `${SITE}/device`);
  });

  await check("after visiting a site-only page, loads of the game page stay signed in (each load left to settle)", async () => {
    for (let n = 1; n <= 3; n++) {
      await settle(page);
      await page.goto(gameUrl);
      await page.locator('[data-testid="text-phase"], [data-testid="button-account-sign-in"]').first().waitFor({ timeout: 30_000 });
      await settle(page);
      assert.equal(await page.getByTestId("button-account-sign-in").count(), 0, `load ${n} of the game page asks to sign in again`);
    }
  });

  await missing(["e2e-account-mode-5"], "BUG: a reload while the token refresh is in flight keeps the grant (v2: the next load gets 400 from /api/oauth/token and asks to sign in)", async () => {
    for (let n = 1; n <= 4; n++) {
      await page.goto(gameUrl);
      await page.locator('[data-testid="text-phase"], [data-testid="button-account-sign-in"]').first().waitFor({ timeout: 30_000 });
      assert.equal(await page.getByTestId("button-account-sign-in").count(), 0, `load ${n}, made right after the last, asks to sign in again`);
    }
    await settle(page);
    await page.goto(gameUrl);
    await page.locator('[data-testid="text-phase"], [data-testid="button-account-sign-in"]').first().waitFor({ timeout: 30_000 });
    await settle(page);
    assert.equal(await page.getByTestId("button-account-sign-in").count(), 0, "after quick reloads the app asks to sign in again");
  });

  await check("Sign out revokes the grant on the engine: the app asks to sign in again", async () => {
    // The game ends first (the room page takes its members into a running game): the owner menu in the game bar.
    await settle(page);
    await page.goto(gameUrl);
    await page.locator('[data-testid="text-phase"], [data-testid="button-account-sign-in"]').first().waitFor({ timeout: 30_000 });
    if (await page.getByTestId("button-account-sign-in").count()) { await approve(); await page.goto(gameUrl); }
    await page.getByTestId("button-owner-menu").click({ timeout: 30_000 });
    await page.getByTestId("button-end-game").click();
    await page.getByTestId("button-end-game-yes").click();
    await page.getByTestId("text-phase").filter({ hasText: /ended/i }).waitFor({ timeout: 60_000 });
    await settle(page);
    await page.goto(`${APP}/rooms/${code}`);
    await page.getByTestId("text-room-code").waitFor();
    await settle(page);
    await page.getByTestId("button-avatar").click();
    await page.getByTestId("button-logout").click();
    await page.getByTestId("button-account-sign-in").waitFor({ timeout: 30_000 });
    const owner = await clientOf(alice.page);
    const credentials = await owner.query("auth/credentials:list" as never, {} as never) as { permission: string; revokedAt?: number }[];
    assert.ok(!credentials.some(c => c.permission === "account" && !c.revokedAt), `no live account grant left: ${JSON.stringify(credentials).slice(0, 300)}`);
  });

  await check("no request from the app to the engine carried a cookie; no page errors", () => {
    assert.deepEqual(cookieSent, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
  server.close();
}
report(everyone);
