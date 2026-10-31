/**
 * Stored panels in the hosted player client (/player/ on the engine's site), in a real browser.
 *
 *   pnpm --filter @workspace/player-web e2e:panels
 *
 * Needs a running local engine (`pnpm --filter @workspace/engine dev`); CG_TEST_CLOUD_URL, CG_TEST_SITE_URL and
 * CG_TEST_OIDC_URL name its ports (defaults 3210 / 3211 / 3399). It uploads a fresh build of the player client
 * first (CG_E2E_SKIP_DEPLOY=1 skips that). Playwright must be resolvable (e.g. NODE_PATH to a global install).
 *
 * What it checks (each line printed as ok / FAIL):
 *   a panel saved with panels.save appears without a reload (a window marker survives), with live data over the
 *   bridge, also when the frame is served from another origin than its CSP names (a custom domain); an update and a rollback change it live; a render-throwing version stays inside its frame; a panel
 *   that tries fetch, parent.document, cookies, storage and image/style/script beacons gets nothing (a local
 *   beacon server sees no request); a panel navigating its frame away is stopped and the page it loads hears
 *   nothing (with and without the page CSP); a chat from a panel shows the host's confirmation with the exact
 *   payload and nothing is sent until confirmed (and nothing when cancelled); the evaluator in a frame scores like
 *   the engine; ?panels=off loads only the core; the page CSP reports nothing of its own and sign-in still works.
 */
import "../../engine/scripts/local-only.mjs";   // refuses to run with CONVEX_DEPLOY_KEY set
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ENGINE = join(ROOT, "artifacts/engine");
const CLOUD = process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
const SITE = process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function check(name: string, run: () => Promise<unknown> | unknown) {
  try { await run(); results.push({ name, ok: true }); console.log(`ok   ${name}`); }
  catch (error) { const detail = (error as Error).message.split("\n")[0]; results.push({ name, ok: false, detail }); console.log(`FAIL ${name}: ${detail}`); }
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

if (!(await fetch(`${SITE}/api/health`).then(r => r.ok, () => false))) {
  console.error(`No engine at ${SITE}. Start one: pnpm --filter @workspace/engine dev`);
  process.exit(1);
}
const anonymous = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
if (process.env.CG_E2E_SKIP_DEPLOY !== "1") {
  console.log("building and uploading the player client…");
  execFileSync("node", ["scripts/deploy-static.mjs", "--only", "player"], { cwd: ENGINE, stdio: "ignore", env: anonymous });
}

// A beacon server: any request reaching it is a leak. /nav is a page a panel may navigate its own frame to: it
// tries to speak the bridge with the nonce it was handed and reports anything it hears back to /got.
const hits: string[] = [];
const NAV_PAGE = `<!doctype html><script>
const nonce = new URLSearchParams(location.hash.slice(1)).get("n");
addEventListener("message", e => { fetch("/got?" + encodeURIComponent(JSON.stringify(e.data).slice(0, 200))); });
parent.postMessage({ type: "ready", nonce }, "*");
parent.postMessage({ type: "subscribe", id: "x", name: "player.observation", args: {}, nonce }, "*");
parent.postMessage({ type: "command", id: "c", envelope: { command: { type: "ready", ready: true } }, nonce }, "*");
</script>`;
const beacon = createServer((req, res) => {
  hits.push(req.url ?? "");
  if (req.url?.startsWith("/nav")) { res.setHeader("content-type", "text/html"); res.end(NAV_PAGE); } else res.end("leak");
});
await new Promise<void>(r => beacon.listen(0, "127.0.0.1", r));
const BEACON = `http://127.0.0.1:${(beacon.address() as { port: number }).port}`;

const { browserJwt, login } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const fn = { q: (n: string) => makeFunctionReference<"query">(n), m: (n: string) => makeFunctionReference<"mutation">(n), a: (n: string) => makeFunctionReference<"action">(n) };

const { session } = await login("carol");
/** carol's Better Auth cookies (login's `session` is the cookie header her sign-in produced). */
const sessionCookies = (header: string) => header.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE }));
const carol = new ConvexHttpClient(CLOUD);
carol.setAuth(await browserJwt(session));
const { roomId, shortCode } = await carol.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
// Earlier runs' panels of this identity would crowd the dock: start clean.
for (const p of await carol.query(fn.q("panels:list"), {}) as { slug: string }[]) await carol.mutation(fn.m("panels:remove"), { slug: p.slug });

async function save(slug: string, source: string) {
  const result = await carol.action(fn.a("panels:save"), { slug, source }) as { ok: boolean; version?: number; diagnostics: unknown[] };
  assert(result.ok, `save ${slug}: ${JSON.stringify(result.diagnostics)}`);
  return result.version!;
}
const live = (label: string) => `import { definePanel, useGame } from "@sdk";
export default definePanel({ title: "E2E live", placement: "left", Component() {
  const game = useGame({ hz: 2 });
  return <p data-testid="sp-text">${label} {game ? "with data" : "loading"}</p>;
} });
`;

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await context.addCookies(sessionCookies(session));
const page = await context.newPage();
const pageErrors: string[] = [];
const cspReports: string[] = [];
page.on("pageerror", e => pageErrors.push(e.message));
// The host page's own CSP reports (the frames' refusals are expected: the hostile panel provokes them).
page.on("console", m => { if (/Content Security Policy/i.test(m.text()) && !/panel-(runtime|frame)|^panel:/.test(m.location().url)) cspReports.push(`${m.location().url}: ${m.text()}`); });
let navigations = 0;
page.on("framenavigated", f => { if (f === page.mainFrame()) navigations++; });
await page.goto(`${SITE}/player/?room=${shortCode}`);
await page.waitForSelector("[data-testid=text-self-label]", { timeout: 60_000 });
await page.evaluate(() => { (window as unknown as { __cgMarker: number }).__cgMarker = 42; });
const sameDocument = async () => navigations === 1 && await page.evaluate(() => (window as unknown as { __cgMarker?: number }).__cgMarker === 42);
const frame = (slug: string) => page.frameLocator(`[data-testid="panel-frame-stored:${slug}"] iframe`);
const frameText = (slug: string, testId: string) => frame(slug).locator(`[data-testid=${testId}]`).textContent({ timeout: 30_000 });
async function frameShows(slug: string, testId: string, expected: RegExp) {
  const end = Date.now() + 30_000;
  for (;;) {
    const text = await frameText(slug, testId).catch(() => null);
    if (text && expected.test(text)) return text;
    if (Date.now() > end) throw new Error(`${slug}: ${testId} shows ${JSON.stringify(text)}, expected ${expected}`);
    await sleep(250);
  }
}

await check("a panel saved with panels.save appears without a reload, with live data over the bridge", async () => {
  assert(await save("e2e-live", live("v1")) === 1, "first version");
  await frameShows("e2e-live", "sp-text", /^v1 with data$/);
  assert(await page.textContent("[data-testid=badge-stored-e2e-live]") === "stored v1", "version badge");
  assert(await page.getAttribute('[data-testid="panel-frame-stored:e2e-live"] iframe', "sandbox") === "allow-scripts", "sandbox attribute");
  assert(await sameDocument(), "the page reloaded");
});

await check("an update and a rollback change the panel live", async () => {
  await save("e2e-live", live("v2"));
  await frameShows("e2e-live", "sp-text", /^v2 with data$/);
  await carol.mutation(fn.m("panels:rollback"), { slug: "e2e-live", version: 1 });
  await frameShows("e2e-live", "sp-text", /^v1 with data$/);
  await page.waitForFunction(() => document.querySelector("[data-testid=badge-stored-e2e-live]")?.textContent === "stored v3", null, { timeout: 15_000 });
  assert(await sameDocument(), "the page reloaded");
});

await check("a panel still runs when its frame CSP names another site origin (a custom domain): 'self' admits the runtime", async () => {
  // Served from a custom domain, the frame's URL is not the deployment's .convex.site that its CSP names. A document
  // served through route.fulfill has no address, so Chromium's local-network checks would block its loopback
  // runtime: this browser runs without them (as in the no-CSP check below).
  const lax = await chromium.launch({ args: ["--disable-features=LocalNetworkAccessChecks"] });
  const laxContext = await lax.newContext();
  await laxContext.addCookies(sessionCookies(session));
  const custom = await laxContext.newPage();
  const customLog: string[] = [];
  custom.on("console", m => customLog.push(m.text().slice(0, 200)));
  await custom.route(url => url.pathname === "/player/panel-frame.html", async route => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll(new URL(SITE).origin, "https://custom-domain.example");
    assert(body.includes("https://custom-domain.example"), "the frame CSP names the site origin");
    await route.fulfill({ response, body });
  });
  await custom.goto(`${SITE}/player/?room=${shortCode}`);
  const end = Date.now() + 30_000;
  for (;;) {
    const text = await custom.frameLocator('[data-testid="panel-frame-stored:e2e-live"] iframe').locator("[data-testid=sp-text]").textContent({ timeout: 30_000 }).catch(() => null);
    if (text === "v1 with data") break;
    if (Date.now() > end) throw new Error(`custom-domain frame shows ${JSON.stringify(text)}; state ${await custom.getAttribute('[data-testid="panel-frame-stored:e2e-live"]', "data-frame-state").catch(() => "none")}; log ${customLog.slice(0, 6).join(" | ")}`);
    await sleep(250);
  }
  assert(!customLog.some(t => /Content Security Policy/i.test(t)), `CSP refused the runtime: ${customLog.join(" | ")}`);
  await lax.close();
});

await check("a render-throwing version stays inside its frame", async () => {
  await save("e2e-throws", `import { definePanel } from "@sdk";\nexport default definePanel({ title: "Throws", Component() { throw new Error("kaboom in render"); } });\n`);
  const end = Date.now() + 30_000;
  for (;;) {
    const text = await frame("e2e-throws").locator("[role=alert]").textContent({ timeout: 30_000 }).catch(() => "");
    if (/crashed while rendering/.test(text ?? "") && /kaboom in render/.test(text ?? "")) break;
    if (Date.now() > end) throw new Error(`no crash message in the frame: ${text}`);
    await sleep(250);
  }
  await frameShows("e2e-live", "sp-text", /^v1 with data$/);
  assert(await page.isVisible("[data-testid=text-self-label]"), "the core console is still there");
  assert(await sameDocument(), "the page reloaded");
});

await check("a hostile panel gets nothing: no fetch, no parent.document, no cookies or storage, no beacons", async () => {
  await save("e2e-hostile", `import { useEffect, useState } from "react";
import { definePanel } from "@sdk";
const BEACON = ${JSON.stringify(BEACON)};
export default definePanel({ title: "Hostile", Component() {
  const [r, setR] = useState<Record<string, string>>({});
  useEffect(() => {
    const set = (k: string, v: string) => setR(x => ({ ...x, [k]: v }));
    fetch("/api/health").then(() => set("fetch", "LEAK"), () => set("fetch", "blocked"));
    fetch(BEACON + "/fetch").then(() => set("fetchBeacon", "LEAK"), () => set("fetchBeacon", "blocked"));
    try { set("parent", "LEAK " + (parent as Window).document.title); } catch { set("parent", "blocked"); }
    try { set("cookie", document.cookie ? "LEAK" : "empty"); } catch { set("cookie", "blocked"); }
    try { localStorage.getItem("cg.layout.v1"); set("storage", "LEAK"); } catch { set("storage", "blocked"); }
    const img = new Image(); img.onload = () => set("img", "LEAK"); img.onerror = () => set("img", "blocked"); img.src = BEACON + "/img";
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = BEACON + "/css"; document.head.appendChild(css);
    const js = document.createElement("script"); js.src = BEACON + "/js"; document.head.appendChild(js);
    try { new WebSocket(BEACON.replace("http", "ws") + "/ws"); } catch { /* blocked */ }
  }, []);
  return <pre data-testid="sp-hostile">{JSON.stringify(r)}</pre>;
} });
`);
  const text = await frameShows("e2e-hostile", "sp-hostile", /"img":/);
  const r = JSON.parse(text) as Record<string, string>;
  for (const key of ["fetch", "fetchBeacon", "parent", "storage", "img"]) assert(r[key] === "blocked", `${key}: ${r[key]} (${text})`);
  assert(r.cookie !== "LEAK", `cookie: ${r.cookie}`);
  await sleep(1500);
  assert(hits.length === 0, `the beacon server was reached: ${hits.join(", ")}`);
});

await check("a panel that navigates its own frame away is stopped; the page it loads hears nothing from the bridge", async () => {
  // The frame's own CSP cannot stop it navigating itself; the hosted page's `frame-src 'self'` does (it governs
  // navigations of its child frames), so the request never leaves; a dev server's page has the same frame-src
  // (vite/csp.ts devPageCsp). Without any page CSP, the page the frame loads must still hear nothing: it does not
  // own the bridge's MessagePort (defence in depth).
  hits.length = 0;
  await save("e2e-navigates", `import { useEffect } from "react";
import { definePanel } from "@sdk";
export default definePanel({ title: "Navigates", Component() {
  useEffect(() => { const t = setTimeout(() => { location.href = ${JSON.stringify(BEACON)} + "/nav" + location.hash; }, 300); return () => clearTimeout(t); }, []);
  return <p>leaving</p>;
} });
`);
  await page.waitForSelector('[data-testid="panel-error-stored:e2e-navigates"]', { timeout: 30_000 });
  assert(/navigate away/.test(await page.textContent('[data-testid="panel-error-stored:e2e-navigates"]') ?? ""), "stopped message");
  await sleep(2000);
  assert(!hits.some(h => h.startsWith("/nav")), "the navigation reached its target despite the page's frame-src");
  assert(!hits.some(h => h.startsWith("/got")), "the navigated page heard the bridge");

  // The same page with its CSP stripped: the navigation happens, the new page still hears nothing.
  // A page served through route.fulfill has no address, so Chromium's local-network checks would block its
  // WebSocket to the local engine: this one browser runs without them.
  const lax = await chromium.launch({ args: ["--disable-features=LocalNetworkAccessChecks"] });
  const laxContext = await lax.newContext();
  await laxContext.addCookies(sessionCookies(session));
  const bare = await laxContext.newPage();
  const bareLog: string[] = [];
  bare.on("console", m => bareLog.push(m.text().slice(0, 150)));
  bare.on("pageerror", e => bareLog.push("pageerror " + e.message.slice(0, 150)));
  await bare.route(url => url.pathname === "/player/", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "") });
  });
  await bare.goto(`${SITE}/player/?room=${shortCode}`);
  await bare.waitForSelector('[data-testid="panel-error-stored:e2e-navigates"]', { timeout: 60_000 }).catch(async error => {
    throw new Error(`no CSP: ${(error as Error).message.split("\n")[0]}; hits ${hits.join(", ")}; frame ${await bare.getAttribute('[data-testid="panel-frame-stored:e2e-navigates"]', "data-frame-state").catch(() => "none")}; csp ${await bare.locator('meta[http-equiv="Content-Security-Policy"]').count()}; text ${(await bare.innerText("body")).slice(0, 300).replace(/\s+/g, " ")}; log ${bareLog.slice(0, 5).join(" | ")}`);
  });
  await sleep(2500);
  assert(hits.some(h => h.startsWith("/nav")), `without the page CSP the frame should have navigated: ${hits.join(", ")}`);
  const heard = hits.filter(h => h.startsWith("/got"));
  assert(heard.length === 0, `the navigated page heard: ${heard.map(decodeURIComponent).join(" | ")}`);
  await lax.close();
  await carol.mutation(fn.m("panels:remove"), { slug: "e2e-navigates" });
});

await check("a chat from a panel shows the host's confirmation; nothing is sent until confirmed", async () => {
  const TEXT = `hello from a stored panel ${Date.now()}`;
  await save("e2e-chat", `import { useState } from "react";
import { definePanel, useActions } from "@sdk";
export default definePanel({ title: "Chatty", Component() {
  const actions = useActions();
  const [r, setR] = useState("idle");
  const send = () => actions.chat(${JSON.stringify(TEXT)}).then(x => setR(x.accepted ? "accepted" : "refused " + x.message), e => setR("error " + e.message));
  return <div><button data-testid="sp-chat" onClick={send}>chat</button><span data-testid="sp-chat-result">{r}</span></div>;
} });
`);
  const chatted = async () => (await carol.query(fn.q("rooms:chatHistory"), { roomId }) as { text: string }[]).some(m => m.text === TEXT);
  await frame("e2e-chat").locator("[data-testid=sp-chat]").click({ timeout: 30_000 });
  await page.waitForSelector("[data-testid=dialog-panel-action]", { timeout: 15_000 });
  const payload = await page.textContent("[data-testid=text-panel-action-payload]");
  assert(payload?.includes(TEXT) && payload.includes('"type": "chat"'), `payload: ${payload}`);
  await sleep(1500);
  assert(!(await chatted()), "the chat was sent before the player confirmed");
  await page.click("[data-testid=button-panel-action-cancel]");
  await frameShows("e2e-chat", "sp-chat-result", /^error The player declined/);
  assert(!(await chatted()), "a cancelled chat was sent");
  await frame("e2e-chat").locator("[data-testid=sp-chat]").click();
  await page.waitForSelector("[data-testid=dialog-panel-action]", { timeout: 15_000 });
  await page.click("[data-testid=button-panel-action-confirm]");
  await frameShows("e2e-chat", "sp-chat-result", /^accepted$/);
  assert(await chatted(), "the confirmed chat did not arrive");
});

await check("the evaluator works in a frame: calibration tables arrive over the bridge, scores match the engine's", async () => {
  const owner = (action: string, extra: Record<string, unknown> = {}) =>
    carol.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
  // A game needs three gods: carol and two (mock) AI seats.
  await owner("addAi", { aiAgentId: "sonnet-strategist" });
  await owner("addAi", { aiAgentId: "sonnet-strategist" });
  await owner("settings", { aiBudget: 50_000, revision: (await carol.query(fn.q("rooms:get"), { room: roomId }) as { revision: number }).revision });
  await owner("start");
  await save("e2e-eval", `import { definePanel, useEvaluator, useObjects } from "@sdk";
export default definePanel({ title: "Evaluator", Component() {
  const evaluator = useEvaluator();
  const objects = useObjects({ hz: 1 });
  if (!evaluator) return <p data-testid="sp-eval">loading</p>;
  if (!objects.length) return <p data-testid="sp-eval">no objects</p>;
  const same = objects.every(o => Math.abs(evaluator.score(o.value).netBits - o.own.netBits) < 1e-9);
  return <p data-testid="sp-eval">{same ? "match" : "mismatch"} {objects.length}</p>;
} });
`);
  await frameShows("e2e-eval", "sp-eval", /^(match|mismatch) \d+$|^no objects$/);
  // Objects spawn once the game runs; wait for some, then every local score must equal the engine's.
  const text = await (async () => { for (let i = 0; i < 4; i++) { try { return await frameShows("e2e-eval", "sp-eval", /^(match|mismatch) \d+$/); } catch { /* still planning */ } } return frameText("e2e-eval", "sp-eval"); })();
  assert(/^match \d+$/.test(text ?? ""), `evaluator: ${text}`);
  await owner("endGame");
});

await check("?panels=off loads only the core console", async () => {
  const safe = await context.newPage();
  await safe.goto(`${SITE}/player/?room=${shortCode}&panels=off`);
  await safe.waitForSelector("[data-testid=text-self-label]", { timeout: 60_000 });
  await safe.waitForSelector("[data-testid=text-safe-mode]");
  await sleep(1500);
  assert(await safe.locator("[data-panel-origin]").count() === 0, "panels rendered in safe mode");
  await safe.close();
});

await check("the hosted page runs under its CSP without violations of its own", async () => {
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', "content");
  assert(csp?.includes("connect-src 'self' " + new URL(CLOUD).origin), `page CSP: ${csp}`);
  // Expected: the navigating panel's frame was refused by frame-src (checked above).
  const own = cspReports.filter(t => !t.includes(`Framing '${BEACON}/`));
  assert(own.length === 0, own.slice(0, 2).join(" | "));
});

await check("sign-in still works under the page CSP: the signed-out page offers it and the link reaches the provider", async () => {
  const fresh = await browser.newContext();
  const out = await fresh.newPage();
  const reports: string[] = [];
  out.on("console", m => { if (/Content Security Policy/i.test(m.text())) reports.push(m.text()); });
  await out.goto(`${SITE}/player/?room=${shortCode}`);
  await out.waitForSelector("[data-testid=link-login]", { timeout: 60_000 });
  await Promise.all([out.waitForURL(url => !url.href.startsWith(`${SITE}/player/`), { timeout: 30_000 }), out.click("[data-testid=link-login]")]);
  assert(reports.length === 0, reports.slice(0, 2).join(" | "));
  await fresh.close();
});

await check("no uncaught page errors in the host", () => assert(pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ")));

for (const slug of ["e2e-live", "e2e-throws", "e2e-hostile", "e2e-chat", "e2e-eval"]) await carol.mutation(fn.m("panels:remove"), { slug }).catch(() => {});
await browser.close();
beacon.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
