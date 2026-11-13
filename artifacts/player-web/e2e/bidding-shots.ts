/**
 * Screenshots of a bid phase played by three people (docs/bid-phase.md), for looking at the screens: a contested
 * auction (alice and bob bid on the same rule, carol passes on a phone), the outcome on each goal card, the standings,
 * and the ended game. Needs the local engine (`pnpm --filter @workspace/engine dev`) and the deployed app
 * (`pnpm --filter @workspace/engine run deploy-static`).
 *
 *   node --experimental-strip-types e2e/bidding-shots.ts [outDir] [--open] [--all-pass]
 *     --open: the setup's bids are open (everyone sees every bid).  --all-pass: nobody bids.
 */
import { createRequire } from "node:module";
import { ConvexHttpClient } from "convex/browser";
import fs from "node:fs";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
type Page = any; type Browser = any;
const SITE = (process.env.CODE_GODS_SITE_URL ?? "http://127.0.0.1:3211").replace(/\/+$/, "");
const CLOUD = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const args = process.argv.slice(2);
const out = args.find(a => !a.startsWith("--")) ?? path.join(import.meta.dirname, "shots", "bidding");
const OPEN = args.includes("--open"), ALL_PASS = args.includes("--all-pass");
fs.mkdirSync(out, { recursive: true });

async function signIn(browser: Browser, who: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on("pageerror", (e: Error) => console.log(`[${who}] page error: ${e.message}`));
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
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD);
  client.setAuth(token);
  return { who, page, client };
}
const call = (c: ConvexHttpClient, kind: "query" | "mutation" | "action", fn: string, a: unknown) => (c as any)[kind](fn, a);
const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage });

const browser = await chromium.launch();
try {
  const alice = await signIn(browser, "alice", { width: 1280, height: 900 });
  const bob = await signIn(browser, "bob", { width: 1280, height: 900 });
  const carol = await signIn(browser, "carol", { width: 390, height: 844 });
  const { roomId, shortCode } = await call(alice.client, "mutation", "rooms:create", {});
  await call(alice.client, "mutation", "rooms:setSpectator", { roomId, spectator: false });
  for (const p of [bob, carol]) await call(p.client, "mutation", "rooms:join", { room: shortCode });
  const room = await call(alice.client, "query", "rooms:get", { room: roomId });
  await call(alice.client, "action", "owner:settings", { roomId, revision: room.revision,
    settings: { bidSeconds: 120, planningSeconds: 3600, ...(OPEN ? { bidVisibility: "open", bidDisclosure: "all" } : {}) } });
  for (const p of [alice, bob, carol]) await p.page.goto(`${SITE}/rooms/${shortCode}`);
  await alice.page.getByTestId("button-start").click();
  for (const p of [alice, bob, carol]) await p.page.getByTestId("list-bid-families").waitFor({ timeout: 60_000 });
  await shot(alice.page, "1-bidding-desktop-empty");
  await shot(carol.page, "1-bidding-phone-empty");
  await shot(carol.page, "1-bidding-phone-empty-viewport", false);
  if (!ALL_PASS) {
    await alice.page.getByTestId("chip-bid-leapfrog-20").click();
    await alice.page.getByTestId("chip-bid-opposite_nines-10").click();
    await bob.page.getByTestId("chip-bid-leapfrog-10").click();
    await bob.page.getByTestId("button-bid-more-leapfrog").click();
    await bob.page.getByTestId("input-bid-two_pair").fill("7");
    await bob.page.getByTestId("input-bid-two_pair").press("Enter");
    await alice.page.getByTestId("text-bid-opposite_nines").waitFor();
    await bob.page.getByTestId("text-bid-two_pair").waitFor();
    if (OPEN) await carol.page.getByTestId("panel-everyones-bids").getByText("20%").waitFor();
    await shot(alice.page, "2-bidding-desktop-with-bids");
    await shot(bob.page, "2-bidding-desktop-bob");
    await shot(carol.page, "2-bidding-phone-others-bidding");
  }
  await carol.page.getByTestId("button-bidding-done").click();
  await carol.page.getByTestId("text-bidding-done").waitFor();
  await shot(carol.page, "3-bidding-phone-passed", false);
  await alice.page.getByTestId("button-bidding-done").click();
  await alice.page.getByTestId("text-bidding-done").waitFor();
  await shot(alice.page, "3-bidding-desktop-done");
  await bob.page.getByTestId("button-bidding-done").click();
  for (const p of [alice, bob, carol]) {
    await p.page.waitForURL(new RegExp(`/rooms/${shortCode}/games/[0-9A-Z]+$`), { timeout: 120_000 });
    await p.page.getByTestId("dock").waitFor({ timeout: 60_000 });
    await p.page.waitForTimeout(4000);
    await shot(p.page, `4-game-${p.who}`);
  }
  for (const p of [alice, bob, carol]) console.log(p.who, JSON.stringify((await call(p.client, "query", "player:observation", { roomId })).self.utility).slice(0, 400));
  await call(alice.client, "mutation", "rooms:endActiveGame", { roomId });
  for (const p of [alice, carol]) { await p.page.waitForTimeout(6000); await shot(p.page, `5-ended-${p.who}`); }
  console.log(`room ${shortCode}; shots in ${out}`);
} finally { await browser.close(); }
