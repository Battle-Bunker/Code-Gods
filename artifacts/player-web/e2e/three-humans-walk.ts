/**
 * A whole three-human game in three browsers (local deployment, as e2e/beginner-walk.ts): alice creates a room on the
 * default setup, bob and carol open it by its link and join, alice starts, each summons the agent the page offers
 * ("Summon my first agent"), the world runs to its end, and each reads the results. Only what the page offers is
 * clicked. It shoots every step for each player and logs what each page says and when, since alice created the room.
 * Nothing is asserted: it is a walk to be read.
 * Usage: node --experimental-strip-types e2e/three-humans-walk.ts <out-dir> [desktop|phone]
 * THREE_HUMANS_STOP=scored stops once every player's agent has made a change.
 */
import "../../engine/scripts/local-only.mjs";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const OUT = (process.argv[2] ?? ".").replace(/\/$/, "");
const SIZE = process.argv[3] === "phone" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
mkdirSync(OUT, { recursive: true });
const SITE = process.env.CG_TEST_SITE_URL ?? "http://127.0.0.1:3211";
const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
type Page = import("playwright").Page;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (label: string, value: unknown) => console.log(`## ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));

async function signIn(who: string): Promise<Page> {
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on("pageerror", e => log(`PAGEERROR ${who}`, String(e).slice(0, 400)));
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
const names = ["alice", "bob", "carol"] as const;
const pages = Object.fromEntries(await Promise.all(names.map(async n => [n, await signIn(n)] as const))) as Record<typeof names[number], Page>;
const { alice, bob, carol } = pages;

let t0 = Date.now(), n = 0;
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
const say = (page: Page, id: string) => page.locator(`[data-testid="${id}"]`).first().innerText({ timeout: 1500 }).then(t => t.replace(/\s+/g, " ").slice(0, 600)).catch(() => null);
async function step(name: string, ids: string[] = [], who: readonly (typeof names[number])[] = names) {
  await sleep(700);
  n++;
  for (const w of who) {
    const file = `${String(n).padStart(2, "0")}-${name}-${w}`;
    await pages[w].screenshot({ path: `${OUT}/${file}.png` });
    const said: Record<string, string | null> = {};
    for (const id of ids) said[id] = await say(pages[w], id);
    log(`${file} (${since()})`, { url: pages[w].url().replace(SITE, ""), ...said, overflow: await pages[w].evaluate(() => `${document.documentElement.scrollWidth}/${window.innerWidth}`) });
  }
}

// ---- alice makes the room; bob and carol follow its link and join
t0 = Date.now();
await alice.getByTestId("button-create-room").click();
await alice.waitForURL(/\/rooms\/[0-9A-Z]+$/);
await alice.getByTestId("button-copy-link").waitFor();
const roomUrl = alice.url();
await step("room-alone", ["text-viewer-seat"], ["alice"]);
for (const p of [bob, carol]) {
  await p.goto(roomUrl);
  await p.getByTestId("button-join").click({ timeout: 30_000 });
}
await alice.locator('[data-testid^="row-member-"]').nth(2).waitFor({ timeout: 30_000 });
await step("room-three", ["text-viewer-seat"]);
await alice.getByTestId("button-start").click({ timeout: 30_000 });
for (const w of names) await pages[w].waitForURL(/\/games\//, { timeout: 180_000 }).catch(() => log(`${w} was not taken to the game`, pages[w].url()));
log("everyone on the game page", since());
await step("planning", ["text-phase", "text-planning", "panel-bidding"]);

// ---- each summons what the page offers
for (const w of names) {
  const p = pages[w];
  const first = p.locator('[data-testid="button-summon-first-agent"]:visible').first();
  await first.waitFor({ timeout: 60_000 }).catch(() => log(`${w}: no "Summon my first agent"`, since()));
  if (await first.count()) await first.click();
  log(`${w} clicked summon`, since());
}
for (const w of names) {
  for (let i = 0; i < 90; i++, await sleep(1000)) if (await pages[w].locator('[data-testid="text-summoned"]:visible, [data-testid^="row-agent-"]:visible').count()) break;
  log(`${w} summoned`, { at: since(), said: await say(pages[w], "text-summoned"), planning: await say(pages[w], "text-planning") });
}
await step("summoned", ["text-phase", "text-planning", "text-energy"]);

// ---- the first change of each player's agent
const scored = new Set<string>();
for (let i = 0; i < 300 && scored.size < 3; i++, await sleep(1000)) {
  for (const w of names) {
    if (scored.has(w)) continue;
    const act = await pages[w].locator('[data-testid^="text-agent-act-"]').first().innerText({ timeout: 400 }).catch(() => "");
    if (/changed/.test(act)) { scored.add(w); log(`FIRST SCORING MOVE ${w}`, `${since()} after the room was created: ${act.replace(/\s+/g, " ").slice(0, 220)}`); }
  }
}
await step("running", ["text-phase", "score-now", "text-energy"]);
if (process.env.THREE_HUMANS_STOP === "scored") { await browser.close(); process.exit(0); }

await sleep(90_000);
await step("mid-game", ["text-phase", "score-now", "text-energy"]);
for (let i = 0; i < 420; i++, await sleep(1000)) if (await alice.locator('[data-testid="panel-results"]:visible, [data-testid="text-results-headline"]:visible').count()) break;
log("results shown to alice", since());
await sleep(3000);
await step("results", ["text-phase", "text-results-headline", "text-results-exact", "panel-results"]);
for (const w of names) await pages[w].screenshot({ path: `${OUT}/${String(n + 1).padStart(2, "0")}-end-full-${w}.png`, fullPage: true });
await browser.close();
process.exit(0);
