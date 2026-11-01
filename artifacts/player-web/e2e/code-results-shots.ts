/**
 * Screenshots of the Code results panel after a run that uses the object store (docs/screenshots/code-results/), with
 * the mock assistant (no provider cost) driven through the composer: turn 1 ranks the player's objects and saves the
 * ranking (store.put) and the script (saveAs); turn 2 re-reads the saved ranking from the store and compares it with
 * the objects now. Shots: phone 390×844 and desktop 1440×900 (cropped to the panel), at 1× to stay small.
 * Usage (local engine running, mocked): node --experimental-transform-types e2e/code-results-shots.ts <out dir>
 */
import "../../engine/scripts/local-only.mjs";
import { createRequire } from "node:module";
import { statSync } from "node:fs";

const OUT = process.argv[2] ?? ".";
const CLOUD = process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
const SITE = process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";
const { browserJwt, login } = await import("../../engine/test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const fn = { q: (n: string) => makeFunctionReference<"query">(n), m: (n: string) => makeFunctionReference<"mutation">(n), a: (n: string) => makeFunctionReference<"action">(n) };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const { session } = await login("alice");
const me = new ConvexHttpClient(CLOUD);
me.setAuth(await browserJwt(session));
const { roomId, shortCode } = await me.mutation(fn.m("rooms:create"), {}) as { roomId: string; shortCode: string };
const owner = (action: string, extra: Record<string, unknown> = {}) => me.action(fn.a("owner:command"), { roomId, action, requestId: crypto.randomUUID(), ...extra });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await owner("addAi", { aiAgentId: "sonnet-strategist" });
await me.mutation(fn.m("rooms:approveAiBudget"), { roomId, aiBudget: 50_000, assistantBudget: 200_000 });
await owner("start");
for (let i = 0; i < 120; i++) {
  const o = await me.query(fn.q("player:observation"), { roomId }) as { phase: string; objects: unknown[] };
  if (o.phase === "running" && o.objects.length >= 5) break;
  await sleep(1000);
}

const RANK = "def main(data):\n    rows = sorted(data['objects'], key=lambda o: -o['payoff'])[:5]\n"
  + "    top = [{'rank': i + 1, 'value': str(o['value'])[:14], 'payoff': round(o['payoff'], 2), 'id': o['id']} for i, o in enumerate(rows)]\n"
  + "    store.put('rankings/top5', top)\n    return [{k: r[k] for k in ('rank', 'value', 'payoff')} for r in top]\n";
const REREAD = "def main(data):\n    saved = store.get('rankings/top5', [])\n    now = {o['id']: o['payoff'] for o in data['objects']}\n"
  + "    return {'summary': 'Your saved top 5, re-read from your store, against payoff now', 'rows': [\n"
  + "        {'rank then': r['rank'], 'value': r['value'], 'payoff then': r['payoff'], 'payoff now': round(now.get(r['id'], 0), 2)} for r in saved]}\n";
const turns = [
  { steps: [{ tools: [{ name: "run_code", input: { language: "python", source: RANK, datasets: ["objects"], title: "Top 5 by payoff (saved)", saveAs: "top5" } }] },
    { tools: [{ name: "open_panel", input: { panelId: "code-output", params: {} } }] }, { text: "Saved your top 5 in your store as rankings/top5." }] },
  { steps: [{ tools: [{ name: "run_code", input: { language: "python", source: REREAD, datasets: ["objects"], load: ["rankings/*"], title: "Saved top 5, re-read" } }] },
    { tools: [{ name: "open_panel", input: { panelId: "code-output", params: {} } }] }, { text: "Here is the saved ranking against the payoffs now." }] },
];

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
const cookies = session.split("; ").map(pair => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: SITE }));
async function ask(text: string) {
  const sent = await me.mutation(fn.m("assistant:send"), { roomId, text }) as { threadId: string; turnId: string };
  for (let i = 0; i < 120; i++) {
    const t = await me.query(fn.q("assistant:thread"), { threadId: sent.threadId }) as { turns: { _id: string; status: string }[] };
    const turn = t.turns.find(x => x._id === sent.turnId);
    if (turn && !["running", "awaiting_confirmation", "cancelling"].includes(turn.status)) return turn.status;
    await sleep(500);
  }
  throw new Error("turn did not finish");
}
for (const t of turns) console.log("turn", await ask(`/mock ${JSON.stringify(t)}`));

const shots: Record<string, number> = {};
for (const [name, viewport, scale] of [["phone-390x844", { width: 390, height: 844 }, 1], ["desktop-1440x900", { width: 1440, height: 900 }, 1]] as const) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
  await context.addCookies(cookies);
  const page = await context.newPage();
  await page.goto(`${SITE}/client/rooms/${shortCode}`);
  await page.locator("[data-testid=table-code-result]").first().waitFor({ timeout: 60_000 });
  await page.locator("[data-testid=panel-code-output]").first().scrollIntoViewIfNeeded();
  const path = `${OUT}/${name}.png`;
  // Desktop: the top bar and the dock's panel row (the assistant pane below holds the raw mock scripts).
  if (viewport.width > 1000) {
    const box = await page.locator("[data-testid=panel-code-output]").first().boundingBox();
    await page.screenshot({ path, clip: { x: 0, y: 0, width: viewport.width, height: Math.min(viewport.height, Math.ceil((box?.y ?? 0) + (box?.height ?? 400) + 40)) } });
  } else await page.screenshot({ path });
  shots[path] = statSync(path).size;
  await context.close();
}
console.log(JSON.stringify(shots));
await browser.close();
