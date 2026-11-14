/**
 * The app on another origin, in account mode (src/core/connection.ts, archive/engine-v1:docs/unify-apps-plan.md §3): built with
 * VITE_CODE_GODS_ENGINE_URL and served from localhost while the engine is 127.0.0.1:<site port>. The human
 * approves an account grant on the engine's /connect page (explicit consent) and the app is then them everywhere:
 * Alice creates a room, plays in it, starts the game and gets her dock, all from the other origin. The consent pages
 * stay on the engine's site, Sign out revokes the grant, and no request from the app to the engine carries a cookie.
 *
 *   pnpm --filter @workspace/engine dev        (a local engine; wait for "[dev] READY")
 *   pnpm --filter @workspace/player-web e2e:account
 *
 * CG_TEST_CLOUD_URL / CG_TEST_SITE_URL / CG_TEST_OIDC_URL name another engine (default: the dev engine's ports).
 */
import "../../engine/scripts/local-only.mjs";   // refuses to run with CONVEX_DEPLOY_KEY set
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const HERE = join(import.meta.dirname, "..");
// The engine's test helpers (sign-in through the stand-in OIDC provider) read these; the dev engine's defaults.
const CLOUD = process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
const SITE = process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";

if (!(await fetch(`${SITE}/api/health`).then(r => r.ok, () => false))) {
  console.error(`No engine at ${SITE}. Start one: pnpm --filter @workspace/engine dev`);
  process.exit(1);
}

const results: string[] = [];
async function step(name: string, fn: () => Promise<void>) {
  await fn();
  results.push(name);
  console.log(`ok - ${name}`);
}

console.log(`# building the app in account mode against ${SITE}`);
const dist = mkdtempSync(join(tmpdir(), "cg-account-"));
execFileSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"], { cwd: HERE, stdio: "inherit", env: { ...process.env, VITE_CODE_GODS_ENGINE_URL: SITE } });

// A plain static host on localhost (another origin than the engine's 127.0.0.1): files, else the app's index.html.
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
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

const { browserJwt, login } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference: ref } = await import("convex/server");
const alice = await login("alice");
// Bob and Carol play too (three players start a game); they join from their own sessions.
const others = await Promise.all(["bob", "carol"].map(async who => {
  const c = new ConvexHttpClient(CLOUD);
  c.setAuth(await browserJwt((await login(who)).session));
  return c;
}));

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies(alice.session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", e => errors.push(e.message));
const cookieSent: string[] = [];
page.on("request", r => {
  if (r.url().startsWith(SITE) && ["fetch", "xhr"].includes(r.resourceType()) && r.frame().url().startsWith(APP) && r.headers().cookie) cookieSent.push(r.url());
});

let code = "";
try {
  await step("signed out, the app offers to sign in on the engine; inside a frame, to open in a tab of its own", async () => {
    await page.goto(`${APP}/`);
    await page.getByTestId("button-account-sign-in").waitFor({ timeout: 30_000 });
    assert.match(await page.getByTestId("screen-account-sign-in").innerText(), new RegExp(new URL(SITE).host.replace(/\./g, "\\.")));
    const framed = await context.newPage();
    await framed.goto(`${APP}/frame.html`);
    await framed.frameLocator("#app").getByTestId("link-open-in-tab").waitFor({ timeout: 30_000 });
    await framed.close();
  });

  await step("denied on the engine's /connect: back on the app's sign-in screen, which says so", async () => {
    await Promise.all([page.waitForURL(u => u.href.startsWith(`${SITE}/connect`), { timeout: 30_000 }), page.getByTestId("button-account-sign-in").click()]);
    await page.getByTestId("panel-connect-account").waitFor({ timeout: 60_000 });
    await Promise.all([page.waitForURL(u => u.href.startsWith(APP), { timeout: 30_000 }), page.getByTestId("button-deny-connect").click()]);
    await page.getByTestId("text-sign-in-error").waitFor({ timeout: 30_000 });
    await page.getByTestId("button-account-sign-in").waitFor();
    assert.ok(!page.url().includes("state="), `the answer is stripped from the URL: ${page.url()}`);
  });

  await step("the account grant needs the human's explicit consent on the engine's /connect, then the app is them", async () => {
    await Promise.all([page.waitForURL(u => u.href.startsWith(`${SITE}/connect`), { timeout: 30_000 }), page.getByTestId("button-account-sign-in").click()]);
    await page.getByTestId("panel-connect-account").waitFor({ timeout: 60_000 });
    assert.equal(await page.getByTestId("text-connect-redirect").textContent(), "localhost", "the consent page names the app's origin");
    assert.equal(await page.getByTestId("button-approve-connect").isDisabled(), true, "never approved without the box ticked");
    await page.getByTestId("checkbox-connect-account-consent").click();
    await Promise.all([page.waitForURL(u => u.href.startsWith(APP), { timeout: 30_000 }), page.getByTestId("button-approve-connect").click()]);
    await page.getByTestId("button-create-room").waitFor({ timeout: 30_000 });
    assert.ok(!page.url().includes("code="), `the code is stripped from the URL: ${page.url()}`);
    assert.equal(await page.getByTestId("button-avatar").getAttribute("aria-label"), "Account: Alice Liddell");
  });

  await step("from the other origin Alice creates a room, plays in it and starts the game: the game page is her dock", async () => {
    await page.getByTestId("button-create-room").click();
    await page.waitForURL(/\/rooms\/[0-9A-Z]+$/, { timeout: 30_000 });
    code = (await page.getByTestId("text-room-code").innerText()).trim();
    for (const c of others) await c.mutation(ref<"mutation">("rooms:join"), { room: code });
    // The owner is seated as a player when the room is created.
    await page.getByTestId(`text-member-seat-${alice.subject}`).filter({ hasText: /owner · player/ }).waitFor();
    await page.getByTestId("button-start").click();
    await page.waitForURL(new RegExp(`/rooms/${code}/games/[0-9A-Z]+$`), { timeout: 480_000 });
    await page.getByTestId("dock").waitFor({ timeout: 60_000 });
    assert.ok(page.url().startsWith(APP), "still on the app's origin");
  });

  await step("a reload keeps the grant (stored per engine) without visiting the engine's pages again", async () => {
    await page.reload();
    await page.getByTestId("dock").waitFor({ timeout: 60_000 });
    assert.ok(page.url().startsWith(APP));
  });

  await step("the consent and admin pages link to the engine's site instead", async () => {
    await page.goto(`${APP}/device`);
    const link = page.getByTestId("link-site-page");
    await link.waitFor({ timeout: 30_000 });
    assert.equal(await link.getAttribute("href"), `${SITE}/device`);
  });

  await step("Sign out revokes the grant on the engine: the app asks to sign in again", async () => {
    // The game ends first: the room page takes its members into a running game.
    const owner = new ConvexHttpClient(CLOUD);
    owner.setAuth(await browserJwt(alice.session));
    const { id: roomId } = await owner.query(ref<"query">("rooms:get"), { room: code }) as { id: string };
    await owner.mutation(ref<"mutation">("rooms:endActiveGame"), { roomId });
    await page.goto(`${APP}/rooms/${code}`);
    await page.getByTestId("panel-active-game").waitFor({ state: "detached", timeout: 30_000 });
    await page.getByTestId("button-avatar").click();
    await page.getByTestId("button-logout").click();
    await page.getByTestId("button-account-sign-in").waitFor({ timeout: 30_000 });
    const credentials = await owner.query(ref<"query">("auth/credentials:list"), {}) as { permission: string; revokedAt?: number }[];
    assert.ok(!credentials.some(c => c.permission === "account" && !c.revokedAt), `no live account grant left: ${JSON.stringify(credentials)}`);
  });

  await step("no request from the app to the engine carried a cookie; no page errors", async () => {
    assert.deepEqual(cookieSent, []);
    assert.deepEqual(errors, []);
  });
  console.log(`\n${results.length} checks passed.`);
} catch (error) {
  await page.screenshot({ path: join(dist, "failed.png") }).catch(() => {});
  console.error(`${error instanceof Error ? error.stack : error}\n${page.url()}\n${(await page.locator("body").innerText().catch(() => "")).slice(0, 1500)}\nScreenshot: ${join(dist, "failed.png")}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
