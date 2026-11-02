/**
 * The hello client served from ANOTHER origin than its engine, in a real browser (docs/external-clients.md §6):
 * the engine is http://127.0.0.1:3211, the client http://localhost:<port>, so every call is cross-origin and the
 * session cookie of the engine site never reaches the client. It signs in (OAuth redirect through the engine UI's
 * /connect page), subscribes, chats, survives a reload, connects from inside an iframe with the device flow, and
 * is revoked from the engine.
 *
 *   pnpm --filter @workspace/engine dev        (a local engine)
 *   pnpm run smoke:hello                       builds and uploads the engine UI (CG_E2E_SKIP_DEPLOY=1 skips it),
 *                                              builds this client, serves it and drives Chromium
 */
import "../../../artifacts/engine/scripts/local-only.mjs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = resolve(HERE, "../../artifacts/engine");
const CLOUD = process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
const SITE = process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";

let passed = 0;
const step = async (name: string, run: () => Promise<unknown>) => { await run(); passed++; console.log(`ok ${passed} - ${name}`); };
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

if (!(await fetch(`${SITE}/api/health`).then(r => r.ok, () => false))) {
  console.error(`No engine at ${SITE}. Start one: pnpm --filter @workspace/engine dev`);
  process.exit(1);
}
const anonymous = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
if (process.env.CG_E2E_SKIP_DEPLOY !== "1") {
  console.log("building and uploading the engine UI (its /connect page)…");
  execFileSync("node", ["scripts/deploy-static.mjs", "--only", "engine"], { cwd: ENGINE, stdio: "ignore", env: anonymous });
}
const dist = mkdtempSync(join(tmpdir(), "cg-hello-"));
execFileSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"], { cwd: HERE, stdio: "inherit", env: { ...process.env, VITE_CODE_GODS_ENGINE_URL: SITE } });

// A plain static server on localhost: another origin than the engine's 127.0.0.1:3211.
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path === "/frame.html") { res.setHeader("content-type", "text/html"); res.end(`<!doctype html><iframe id="app" style="width:900px;height:700px" src="/${new URL(req.url!, "http://x").search}"></iframe>`); return; }
  const file = join(dist, path === "/" ? "index.html" : path);
  if (!file.startsWith(dist) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
  res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
});
await new Promise<void>(r => server.listen(0, "localhost", r));
const APP = `http://localhost:${(server.address() as { port: number }).port}`;

const { browserJwt, login } = await import("../../../artifacts/engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference: ref } = await import("convex/server");
const { session } = await login("alice");
const alice = new ConvexHttpClient(CLOUD);
alice.setAuth(await browserJwt(session));
const { shortCode } = await alice.mutation(ref<"mutation">("rooms:create"), {}) as { roomId: string; shortCode: string };
const cookies = session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE }));

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies(cookies);   // the human is signed in to the ENGINE site only
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", e => errors.push(e.message));
const sent = new Set<string>();
// The client's own calls to the engine (fetches from a page on the client's origin), not the navigations to /connect.
page.on("request", r => {
  if (r.url().startsWith(SITE) && ["fetch", "xhr"].includes(r.resourceType()) && r.frame().url().startsWith(APP)) sent.add(r.headers().cookie ? "cookie" : "none");
});

try {
  await step("signs in from another origin: OAuth redirect → the engine's /connect → back with a room token", async () => {
    await page.goto(`${APP}/?room=${shortCode}`);
    assert(await page.inputValue("#engine") === SITE, "engine URL from the build");
    await Promise.all([page.waitForURL(u => u.href.startsWith(`${SITE}/connect`), { timeout: 30_000 }), page.click("#connect")]);
    await page.waitForSelector("[data-testid=button-approve-connect]:not([disabled])", { timeout: 60_000 });
    const shown = await page.textContent("[data-testid=text-connect-redirect]");
    assert(shown === "localhost", `the consent page names the client's origin: ${shown}`);
    assert(await page.isVisible("[data-testid=text-connect-foreign]"), "and says it is not the engine");
    await Promise.all([page.waitForURL(u => u.href.startsWith(APP), { timeout: 30_000 }), page.click("[data-testid=button-approve-connect]")]);
    await page.waitForSelector("#game:not([hidden])", { timeout: 30_000 });
    assert(!page.url().includes("code="), `the code is stripped from the URL: ${page.url()}`);
    assert((await page.textContent("#who"))!.includes(`Room ${shortCode}, act access`), "room and permission");
  });

  await step("subscribes live and acts: the chat goes through commands.submit and comes back on the WebSocket", async () => {
    await page.waitForFunction(() => /lobby/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 30_000 });
    const text = `hello from ${APP}`;
    await page.fill("#say", text);
    await page.click("#send");
    await page.waitForFunction(t => [...document.querySelectorAll("#chat li")].some(li => li.textContent?.endsWith(t)), text, { timeout: 30_000 });
    const room = await alice.query(ref<"query">("rooms:get"), { room: shortCode }) as { chat: { text: string; authorName: string }[] };
    assert(room.chat.some(m => m.text === text && m.authorName === "Alice Liddell"), "as the human who approved");
  });

  await step("a reload keeps the connection (stored per room) without visiting the engine again", async () => {
    await page.reload();
    await page.waitForSelector("#game:not([hidden])", { timeout: 30_000 });
    assert(page.url().startsWith(APP), "stayed on the client");
  });

  await step("inside an iframe it connects with the device flow instead (no redirect, no framed sign-in)", async () => {
    const framed = await context.newPage();
    await framed.goto(`${APP}/frame.html?room=${shortCode}`);
    const app = framed.frameLocator("#app");
    await app.locator("#engine").waitFor({ state: "attached" });
    // Same site as the first tab, so the frame sees its stored connection: forget it, as a fresh profile would.
    const inner = framed.frame({ url: u => u.pathname === "/" })!;
    await inner.evaluate(() => localStorage.clear());
    await inner.goto(`${APP}/?room=${shortCode}`);
    await app.locator("#setup:not([hidden])").waitFor();
    await app.locator("#connect").click();
    await app.locator("#device:not([hidden])").waitFor({ timeout: 30_000 });
    const code = await app.locator("#device-code").textContent();
    assert(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code ?? ""), `a comparison code: ${code}`);
    await alice.mutation(ref<"mutation">("auth/device:approve"), { userCode: code });
    await app.locator("#game:not([hidden])").waitFor({ timeout: 30_000 });
    await framed.close();
  });

  await step("revoked on the engine: the live client loses its connection and says so", async () => {
    const listed = await alice.query(ref<"query">("auth/credentials:list"), {}) as { credentialId: string; kind: string; label: string; roomCode: string }[];
    const mine = listed.filter(c => c.roomCode === shortCode && c.label.startsWith("Hello client"));
    assert(mine.length === 2, `the OAuth connection and the device credential are listed: ${JSON.stringify(mine.map(c => c.kind))}`);
    for (const c of mine) await alice.mutation(ref<"mutation">("auth/credentials:revoke"), { credentialId: c.credentialId });
    await page.waitForSelector("#setup:not([hidden])", { timeout: 30_000 });
    assert(/revoked|expired|UNAUTHENTICATED|reconnect/i.test(await page.textContent("#error") ?? ""), `explains: ${await page.textContent("#error")}`);
  });

  await step("no request from the client to the engine carried a cookie; no page errors", async () => {
    assert(sent.has("none"), "the client called the engine");
    assert(!sent.has("cookie"), "the engine's session cookie never travels with the client's calls");
    assert(errors.length === 0, errors.join("; "));
  });
} finally {
  await browser.close();
  server.close();
}
console.log(`# pass ${passed}`);
