/**
 * Where the seconds of a forge check go: one running game (the owner + two mock AI seats), the forge open in a real
 * browser, an edited agent checked with the Validate button. For each check it prints the click → result time seen in
 * the page, the websocket send/receive of the `commands:submit` action, and the backend's own durations of every
 * function that ran in that window (the admin log stream), grouped by name. Then the same validate through
 * `commands:submit` from Node for comparison.
 *
 *   pnpm --filter @workspace/engine dev            # wait for "[dev] READY"
 *   pnpm --filter @workspace/engine deploy-static
 *   cd artifacts/player-web && node --experimental-transform-types --disable-warning=ExperimentalWarning e2e/forge-check-timing.ts [checks]
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const CHECKS = Number(process.argv[2] ?? 4);
const CLOUD = process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
const SITE = process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";
const { browserJwt, login } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const fn = { q: (n: string) => makeFunctionReference<"query">(n), m: (n: string) => makeFunctionReference<"mutation">(n), a: (n: string) => makeFunctionReference<"action">(n) };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const config = JSON.parse(readFileSync(new URL("../../engine/.convex/local/default/config.json", import.meta.url), "utf8"));
const admin = new ConvexHttpClient(CLOUD);
(admin as unknown as { setAdminAuth(key: string): void }).setAdminAuth(config.adminKey);

// ---- the backend's execution log, pulled continuously -------------------------------------------------------------
type Entry = { kind?: string; identifier?: string; udfType?: string; timestamp: number; executionTime?: number; requestId?: string; caller?: string; cachedResult?: boolean };
const entries: Entry[] = [];
let cursor = 0, stopLog = false;
const pull = async () => {
  const r = await fetch(`${CLOUD}/api/stream_function_logs?cursor=${cursor}`, { headers: { Authorization: `Convex ${config.adminKey}` } });
  const page = await r.json() as { entries: Entry[]; newCursor: number };
  if (cursor && page.entries.length >= 1000) console.warn("# log window overflowed");
  cursor = page.newCursor;
  for (const e of page.entries) if (e.kind === "Completion" && e.identifier) entries.push(e);
};
await pull(); entries.length = 0;
const logLoop = (async () => { while (!stopLog) { await pull().catch(() => {}); await sleep(100); } })();

/** Every function that completed in [from, to] (epoch ms), by name: calls, total and max seconds (an execution overlaps the window). */
function window(from: number, to: number) {
  const by = new Map<string, { n: number; total: number; max: number; type: string; cached: number }>();
  for (const e of entries) {
    const end = e.timestamp * 1000, start = end - (e.executionTime ?? 0) * 1000;
    if (end < from || start > to) continue;
    const k = by.get(e.identifier!) ?? { n: 0, total: 0, max: 0, type: e.udfType ?? "?", cached: 0 };
    k.n++; k.total += e.executionTime ?? 0; k.max = Math.max(k.max, e.executionTime ?? 0); if (e.cachedResult) k.cached++;
    by.set(e.identifier!, k);
  }
  return [...by.entries()].sort((a, b) => b[1].total - a[1].total);
}
const show = (rows: ReturnType<typeof window>, top = 14) => rows.slice(0, top).map(([id, s]) =>
  `    ${id.padEnd(44)} ${s.type.padEnd(8)} n=${String(s.n).padStart(4)} total=${s.total.toFixed(2)}s max=${s.max.toFixed(2)}s${s.cached ? ` cached=${s.cached}` : ""}`).join("\n");

/** The executions of the one commands:submit in [from, to] that share its request id, as offsets from `from`. */
function timeline(from: number, to: number) {
  const span = (e: Entry) => { const end = e.timestamp * 1000; return [end - (e.executionTime ?? 0) * 1000 - from, end - from]; };
  const submitE = entries.find(e => e.identifier === "commands:submit" && e.timestamp * 1000 >= from && e.timestamp * 1000 <= to + 2000);
  if (!submitE) { console.log("    (no commands:submit logged)"); return; }
  const mine = entries.filter(e => e.requestId === submitE.requestId).map(e => [e.identifier, e.udfType, ...span(e)] as const).sort((a, b) => a[2] - b[2]);
  for (const [id, type, s, e] of mine) console.log(`      ${String(Math.round(s)).padStart(6)} → ${String(Math.round(e)).padStart(6)} ms  ${type} ${id}`);
  const auth = entries.filter(e => e.identifier?.startsWith("GET /api/auth")).map(span).filter(([s, e]) => e >= 0 && s <= to - from);
  console.log(`      auth GETs: ${auth.map(([s, e]) => `${Math.round(s)}+${Math.round(e - s)}`).join(" ")}`);
}

// ---- a running game -----------------------------------------------------------------------------------------------
const as = async (who: string) => { const { session } = await login(who); const c = new ConvexHttpClient(CLOUD); c.setAuth(await browserJwt(session)); return { c, session }; };
const bob = await as("admin");
const { roomId, shortCode } = await bob.c.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
await bob.c.mutation(fn.m("rooms:setSpectator"), { roomId, spectator: false });
const owner = (action: string, extra: Record<string, unknown> = {}) => bob.c.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
await admin.mutation(fn.m("aiTemplates:ensureSeeded"), {});
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
const room = await bob.c.query(fn.q("rooms:get"), { room: roomId }) as { revision: number };
await owner("settings", { revision: room.revision, settings: { languages: ["python"], planningSeconds: 600, halfLifeSeconds: 3600 } });
await owner("start");
let gameId = "", gameCode = "";
for (let i = 0; i < 180 && !gameId; i++, await sleep(1000)) {
  const o = await bob.c.query(fn.q("player:observation"), { roomId }) as { gameId?: string; gameShortCode?: string };
  if (o.gameId) ({ gameId, gameShortCode: gameCode } = { gameId: o.gameId, gameShortCode: o.gameShortCode ?? "" });
}
assert.ok(gameId, "the game started");
const submit = (command: Record<string, unknown>) => bob.c.action(fn.a("commands:submit"), { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), gameId, command } }) as Promise<{ accepted: boolean; message: string }>;
for (let i = 0; i < 60; i++, await sleep(2000)) {
  const r = await submit({ type: "summon", name: "First", language: "python", source: "def agent(grid):\n    return [slide(row(0), 1)]" });
  if (r.accepted) break;
  if (!/warm|ready/i.test(r.message)) throw new Error(r.message);
}
if (process.env.PLANNING !== "1") await admin.mutation(fn.m("testing:patchGame"), { gameId, patch: { planningEndsAt: Date.now() }, kick: true });
await sleep(5000);

// ---- the forge in a browser ---------------------------------------------------------------------------------------
await bob.c.mutation(fn.m("layout:set"), { roomId, layout: { version: 1, root: { type: "split", direction: "row", sizes: [62, 38], children: [{ type: "pane", id: "p1" }, { type: "pane", id: "p2" }] },
  panes: { p1: { id: "p1", kind: "panel", panelId: "forge", params: {}, setBy: "human" }, p2: { id: "p2", kind: "panel", panelId: "objects", params: {}, setBy: "human" } } } });
const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await context.addCookies(bob.session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE })));
const page = await context.newPage();
// The action's request and response on the Convex websocket.
const frames: { at: number; dir: "out" | "in"; type: string; requestId?: string; udfPath?: string; bytes: number }[] = [];
page.on("websocket", ws => {
  const note = (dir: "out" | "in") => (f: { payload: string | Buffer }) => {
    const text = String(f.payload);
    try { const m = JSON.parse(text); frames.push({ at: Date.now(), dir, type: m.type, requestId: m.requestId, udfPath: m.udfPath, bytes: text.length }); } catch { /* binary */ }
  };
  ws.on("framesent", note("out")); ws.on("framereceived", note("in"));
});
await page.goto(`${SITE}/rooms/${shortCode}/games/${gameCode}`);
await page.waitForSelector("[data-testid=input-source]", { timeout: 60_000 });
await sleep(5000);

const results: number[] = [];
for (let i = 0; i < CHECKS; i++) {
  const source = `def agent(grid):\n    # check ${i} ${crypto.randomUUID().slice(0, 8)}\n    return [slide(row(${i % 3}), 1)]`;
  await page.fill("[data-testid=input-source]", source);
  await sleep(1500);
  const before = frames.length;
  const t0 = Date.now();
  await page.click("[data-testid=button-validate]");
  await page.waitForFunction(() => /Validate \(free\)/.test(document.querySelector("[data-testid=button-validate]")?.textContent ?? ""), null, { timeout: 120_000, polling: 50 });
  const t1 = Date.now();
  results.push(t1 - t0);
  await sleep(1500);
  const mine = frames.slice(before);
  const sent = mine.find(f => f.dir === "out" && f.type === "Action");
  const answered = sent && mine.find(f => f.dir === "in" && f.type === "ActionResponse" && f.requestId === sent.requestId);
  const traffic = mine.filter(f => f.dir === "in" && f.at <= t1);
  console.log(`check ${i + 1}: click→done ${t1 - t0} ms; click→ws send ${sent ? sent.at - t0 : "?"} ms; ws send→response ${answered ? answered.at - sent!.at : "?"} ms; response→done ${answered ? t1 - answered.at : "?"} ms; ${traffic.length} frames in (${traffic.reduce((s, f) => s + f.bytes, 0)} bytes)`);
  console.log(show(window(t0, t1)));
  if (process.env.TIMELINE) timeline(t0, t1);
  await sleep(3000);
}

// ---- the same through commands:submit from Node -------------------------------------------------------------------
for (let i = 0; i < 2; i++) {
  const t0 = Date.now();
  const r = await submit({ type: "validate", language: "python", source: `def agent(grid):\n    # node ${crypto.randomUUID().slice(0, 8)}\n    return [slide(row(1), 1)]` });
  const t1 = Date.now();
  console.log(`node validate ${i + 1}: ${t1 - t0} ms accepted=${r.accepted}`);
  console.log(show(window(t0, t1), 8));
  await sleep(3000);
}
console.log(JSON.stringify({ room: shortCode, game: gameCode, browserMs: results }));
await browser.close();
await bob.c.mutation(fn.m("rooms:endActiveGame"), { roomId });
stopLog = true; await logLoop;
