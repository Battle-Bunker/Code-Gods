/**
 * File panels (src/panels/*.tsx) with live reload, against the LIVE local engine and a Vite dev server of this app in
 * site mode (v1's multi-client "HMR" checks): carol starts a practice game on the engine's site and opens it in the dev
 * server; a panel file written mid-game opens as a pane without a reload and shows live data; an edit updates it in
 * place; a syntax error stays inside its pane while the game keeps going; the fix recovers it; ?panels=off runs it not;
 * the file deleted, its pane says so. The test file is removed at the end whatever happens.
 *
 *   pnpm --filter @workspace/player-web run e2e:file-panels
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const CLOUD = `http://127.0.0.1:${process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3210"}`;
const PORT = Number(process.env.E2E_DEV_PORT ?? 22791);
const DEV = `http://127.0.0.1:${PORT}`;
const FILE = path.join(import.meta.dirname, "../src/panels/e2e-live.tsx");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const vite = spawn("npx", ["vite", "--config", "vite.config.ts", "--host", "127.0.0.1"], {
  cwd: path.join(import.meta.dirname, ".."), detached: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(PORT), CODE_GODS_SITE_URL: SITE, VITE_CONVEX_URL: CLOUD, VITE_CONVEX_SITE_URL: SITE },
});
let viteLog = "";
vite.stdout!.on("data", d => { viteLog += d; if (process.env.E2E_VITE_LOG) process.stdout.write(`[vite] ${d}`); });
vite.stderr!.on("data", d => { viteLog += d; });
const stop = () => { rmSync(FILE, { force: true }); try { process.kill(-vite.pid!, "SIGTERM"); } catch { /* gone */ } };
process.on("exit", stop);

const browser = await chromium.launch();
try {
  for (let end = Date.now() + 120_000; ; await sleep(500)) {
    if (await fetch(`${DEV}/`).then(r => r.ok, () => false)) break;
    if (Date.now() > end) throw new Error(`the dev server did not start:\n${viteLog.slice(-2000)}`);
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  const logs: string[] = [];
  page.on("console", (m: any) => logs.push(m.text().slice(0, 200)));
  const toasts = () => page.locator("ol li").allInnerTexts().then((t: string[]) => t.filter(Boolean)).catch(() => []);
  // Signed in on the engine's site (the session cookie is the host's, so the dev server's proxied /api shares it).
  await page.goto(`${SITE}/`);
  await page.getByTestId("button-login").waitFor();
  const url = await page.evaluate(async () => {
    const r = await fetch("/api/auth/sign-in/oauth2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: "fake", callbackURL: "/" }) });
    return ((await r.json()) as { url: string }).url;
  });
  await page.goto(url);
  await page.getByRole("link", { name: /\(carol\)/ }).click();
  await page.waitForURL(`${SITE}/`);
  await page.getByTestId("button-create-room").first().click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  await page.getByTestId("button-practice-game").click();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
  const game = new URL(page.url()).pathname;

  await page.goto(`${DEV}${game}`);
  await page.getByTestId("dock").waitFor({ timeout: 90_000 });
  await page.evaluate(() => { (window as unknown as { __mark: number }).__mark = 1; });
  const sameDocument = () => page.evaluate(() => (window as unknown as { __mark?: number }).__mark === 1);

  // A new panel file mid-game: a pane of its own, live data, no reload.
  writeFileSync(FILE, `import { definePanel, useGame, useMe } from "@sdk";
export default definePanel({ title: "E2E live", placement: "left", Component() {
  const game = useGame(); const me = useMe();
  return <p data-testid="e2e-live">v1 phase {game?.phase} energy {me ? Math.round(me.energy) : "?"}</p>;
} });
`);
  const live = page.getByTestId("e2e-live");
  await live.waitFor({ timeout: 30_000 }).catch(async (e: Error) => {
    await page.screenshot({ path: path.join(import.meta.dirname, "shots", "file-panels-new.png") }).catch(() => {});
    const store = await page.evaluate(async () => { const m = await import("/src/panels/store.ts" as string); const st = m.filePanelStore.get(); return JSON.stringify({ ids: st.entries.map((x: { id: string }) => x.id), generation: st.generation }); }).catch((x: Error) => x.message);
    throw new Error(`${e.message.split("\n")[0]}; store ${store}; toasts ${JSON.stringify(await toasts())}; logs ${logs.filter(l => /error|fail/i.test(l)).join(" || ")}; the dock: ${await page.getByTestId("dock-desktop").getAttribute("data-dock").catch(() => "?")}; the pane: ${await page.getByTestId("pane-file:e2e-live").innerText().catch(() => "(none)")}; same document ${await sameDocument().catch(() => "?")}; errors ${errors.join(" | ")}; vite: ${viteLog.slice(-1500)}`);
  });
  assert.match(await live.innerText(), /^v1 phase (planning|live) energy \d+$/);
  assert.ok(await sameDocument(), "the page reloaded for a new panel");
  console.log("ok   a new file panel opens as a pane without a reload, with live data");

  // An edit updates it in place. (Each write waits a moment, as a person's saves do: the dev server's watcher can miss
  // a second write of a file within about a second of the one before.)
  await sleep(1500);
  writeFileSync(FILE, (await import("node:fs")).readFileSync(FILE, "utf8").replace("v1 phase", "v2 phase"));
  await page.getByTestId("e2e-live").getByText(/^v2 phase/).waitFor({ timeout: 30_000 });
  assert.ok(await sameDocument(), "the page reloaded for an edit");
  console.log("ok   an edit updates it in place");

  // A syntax error stays in its pane; the rest of the game keeps working; the fix recovers it.
  const good = (await import("node:fs")).readFileSync(FILE, "utf8");
  await sleep(1500);
  writeFileSync(FILE, `import { definePanel } from "@sdk";\nexport default definePanel({ title: "E2E live", Component() { return <p>broken</p> ; } ) ;;; <<<\n`);
  const broken = page.getByTestId("panel-error-e2e-live.tsx");
  await broken.waitFor({ timeout: 30_000 }).catch(async (e: Error) => {
    throw new Error(`${e.message.split("\n")[0]}; the pane: ${await page.getByTestId("pane-file:e2e-live").innerText().catch(() => "(none)")}; same document ${await sameDocument().catch(() => "?")}; vite: ${viteLog.slice(-1500)}`);
  });
  assert.match(await broken.innerText(), /e2e-live\.tsx|Unexpected|expected/i);
  assert.ok(await page.getByTestId("dock").isVisible(), "the dock is still there");
  assert.ok(await sameDocument(), "the page reloaded for a syntax error");
  await sleep(1500);
  writeFileSync(FILE, good.replace("v2 phase", "v3 phase"));
  await page.getByTestId("e2e-live").getByText(/^v3 phase/).waitFor({ timeout: 30_000 });
  assert.ok(await sameDocument(), "the page reloaded for the fix");
  console.log("ok   a syntax error stays in its pane, and the fix recovers it");

  // Safe mode runs it not.
  const safe = await context.newPage();
  await safe.goto(`${DEV}${game}?panels=off`);
  await safe.getByTestId("text-safe-mode").waitFor({ timeout: 90_000 });
  await safe.getByTestId("file-panel-safe-mode").waitFor({ state: "attached", timeout: 30_000 });
  assert.equal(await safe.getByTestId("e2e-live").count(), 0, "a file panel ran in safe mode");
  await safe.close();
  console.log("ok   ?panels=off runs no file panel");

  // Deleted: the pane says so.
  await sleep(1500);
  rmSync(FILE);
  await page.getByTestId("file-panel-missing").waitFor({ timeout: 30_000 });
  assert.ok(await sameDocument(), "the page reloaded for a deletion");
  assert.deepEqual(errors, [], "no page errors");
  console.log("ok   a deleted file panel's pane says so");
} finally {
  await browser.close();
  stop();
}
console.log("ok - file panels: live reload mid-game, contained errors, safe mode, deletion");
process.exit(0);
