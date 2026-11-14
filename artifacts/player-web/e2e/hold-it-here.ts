/**
 * "Hold it here" end to end, deterministically: a live line game seeded with line 1 contested (the owner's agent and a
 * practice partner's pulling it back and forth: convex/v2/testing.ts seedGame `contested`), at desktop (1440×900) and
 * phone (390×844). One line on line 1 offers "Hold it here: set up my agent"; the tap opens the agent's hold control
 * filled in with line 1's number and its current state (TARGET m and c), and nothing is saved before Save. Captures the
 * opened control (deviceScaleFactor 2) into the given directory.
 *
 *   node --experimental-transform-types e2e/hold-it-here.ts [screenshot dir]      (SKIP_DEPLOY=1 reuses the upload)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const ENGINE = path.join(ROOT, "artifacts/engine");
const OUT = process.argv[2] ?? path.join(import.meta.dirname, "shots");
mkdirSync(OUT, { recursive: true });

const convexRun = (fn: string, args: unknown) => {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: ENGINE, encoding: "utf8", env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" } }).trim();
  return out ? JSON.parse(out) : null;
};
if (!process.env.SKIP_DEPLOY) {
  const deploy = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: ROOT, stdio: "inherit" });
  assert.equal(deploy.status, 0, "deploy-static failed");
}

async function signIn(browser: any, who: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page: Page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
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
  const subject = await page.evaluate(async () => ((await (await fetch("/api/auth/get-session")).json()) as { user: { id: string } }).user.id);
  return { context, page, errors, subject };
}

/** "y = −3x + 10" → { m: -3, c: 10 } ("y = x", "y = −x − 4", "y = 7"). */
function mc(eq: string): { m: number; c: number } {
  const t = eq.replace(/\s/g, "").replace(/−/g, "-").replace(/^y=/, "");
  const mm = /^([+-]?\d*)x/.exec(t);
  const m = mm ? (mm[1] === "" || mm[1] === "+" ? 1 : mm[1] === "-" ? -1 : Number(mm[1])) : 0;
  const rest = mm ? t.slice(mm[0].length) : t;
  return { m, c: rest ? Number(rest) : 0 };
}

const browser = await chromium.launch();
try {
  for (const [label, viewport, who] of [["desktop", { width: 1440, height: 900 }, "alice"], ["phone", { width: 390, height: 844 }, "bob"]] as const) {
    const { context, page, errors, subject } = await signIn(browser, who, viewport);
    const room = `H${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const g = convexRun("v2/testing:seedGame", { owner: subject, practice: 2, code: room, contested: 1 });
    await page.goto(`${SITE}/rooms/${room}/games/${g.gameId}`);
    const row = page.getByTestId("row-line-1");
    if (label === "phone" && await page.getByTestId("button-jump-objects").count()) await page.getByTestId("button-jump-objects").click();
    await row.scrollIntoViewIfNeeded({ timeout: 20_000 });
    await row.click();
    const line = page.getByTestId("pane-object");
    // The contested line offers "Hold it here", with its set-up button (live game, an agent, a whole-number target).
    const hold = line.getByTestId("hold-it-here");
    await hold.waitFor({ timeout: 20_000 });
    const now = mc(await line.locator(".v2v-chip-eq").first().innerText());
    await hold.getByTestId("button-hold-it-here").click();
    // The agent's hold control, filled in with this line and its current state: read, not yet saved.
    const form = page.getByTestId("hold");
    await form.waitFor({ timeout: 10_000 });
    await form.scrollIntoViewIfNeeded();
    assert.equal(await form.getByTestId("input-hold-numbers").inputValue(), "1", `${label}: line 1's number`);
    assert.equal(Number(await form.getByTestId("input-hold-m").inputValue()), now.m, `${label}: the gradient, ${now.m}`);
    assert.equal(Number(await form.getByTestId("input-hold-c").inputValue()), now.c, `${label}: the intercept, ${now.c}`);
    assert.equal(await form.getByTestId("text-hold-done").count(), 0, `${label}: nothing saved yet`);
    assert.equal(await form.getByTestId("button-hold-stop").count(), 0, `${label}: not holding yet (Save not pressed)`);
    assert.ok(await form.getByTestId("button-hold").isEnabled(), `${label}: Save is offered`);
    await page.screenshot({ path: path.join(OUT, `opened-${label}.jpg`), type: "jpeg", quality: 70 });
    assert.deepEqual(errors, [], `${label}: no page errors`);
    console.log(`ok ${label}: hold control opened for line 1 at y = ${now.m}x + ${now.c}, unsaved`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("ok - Hold it here opens the hold control, filled in, at desktop and phone");
