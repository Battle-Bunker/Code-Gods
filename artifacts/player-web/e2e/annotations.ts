/**
 * Goal annotations in a browser (docs/annotations-design.md): the gallery page (annotations.html) on a Vite dev server
 * this script starts. Checks what only a browser shows: each annotated family's goal-card example draws a verified
 * breakdown; hovering a cell moves the focus and its pieces (Set Spotter: only trios ENDING at the focus); a compact
 * grid's hover view starts on the top-left cell; arrow keys move the focus.
 *
 *   node --experimental-transform-types e2e/annotations.ts
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const PORT = Number(process.env.PORT_ANNOTATIONS ?? 22795), BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("npx", ["vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(PORT) }, detached: true,
});
// npx runs vite as a child: stop the whole process group.
const stop = () => { try { process.kill(-server.pid!, "SIGTERM"); } catch { /* already gone */ } };
await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => { stop(); reject(new Error("vite did not start")); }, 60_000);
  server.stdout.on("data", (d: Buffer) => { if (String(d).includes("ready")) { clearTimeout(t); resolve(); } });
});

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch();
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${BASE}/annotations.html`);
  const families = await page.locator("[data-family]").evaluateAll(els => els.map(e => e.getAttribute("data-family")!));
  assert.ok(families.length >= 8, `at least 8 annotated families (${families.length})`);
  for (const f of families) {
    const board = page.locator(`[data-testid=example-${f}]`);
    assert.equal(await board.getAttribute("data-rich"), "true", `${f}: the example's breakdown adds up to the card's score`);
    assert.match(await board.locator("[data-testid=goal-board-headline]").innerText(), /^Row \d, column \d: /);
    assert.ok(await board.locator("[data-testid=goal-callout], [data-testid=goal-outcome-table]").count() > 0, `${f}: the default focus expands something`);
  }

  // A family without a lens: the board and its score, no breakdown, no crash.
  const plain = page.locator("[data-testid=example-plain]");
  assert.equal(await plain.getAttribute("data-rich"), null);
  assert.match(await plain.locator("[data-testid=goal-board-total]").innerText(), /^This board: \d+ points?/);
  await plain.locator('[data-cell="1,1"]').hover();
  assert.equal(await plain.locator("[data-testid=goal-callout]").count(), 0);

  // Set Spotter: hover each cell; every trio shown has the hovered cell at one END.
  const set = page.locator("[data-testid=example-set_spotter]");
  for (const [r, c] of [[0, 0], [1, 1], [2, 3], [3, 2]]) {
    await set.locator(`[data-cell="${r},${c}"]`).hover();
    assert.ok((await set.locator("[data-testid=goal-board-headline]").innerText()).startsWith(`Row ${r + 1}, column ${c + 1}:`));
    const ids = await set.locator("[data-testid=goal-callout]").evaluateAll(els => els.map(e => e.getAttribute("data-part")!));
    assert.ok(ids.length > 0);
    for (const id of ids) {
      const [, at, dir] = id.split(":"), [r0, c0] = at.split(",").map(Number);
      const step = ({ right: [0, 1], down: [1, 0], "down-right": [1, 1], "down-left": [1, -1] } as Record<string, number[]>)[dir];
      const ends = [[r0, c0], [r0 + 2 * step[0], c0 + 2 * step[1]]];
      assert.ok(ends.some(([y, x]) => y === r && x === c), `${id} ends at ${r},${c}`);
    }
  }
  // The focus stays where the pointer left it.
  await page.mouse.move(5, 5);
  assert.match(await set.locator("[data-testid=goal-board-headline]").innerText(), /^Row 4, column 3:/);

  // Keyboard: arrow keys move the focus.
  await set.locator("[data-testid=goal-board-grid]").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  assert.match(await set.locator("[data-testid=goal-board-headline]").innerText(), /^Row 1, column 2:/);

  // A compact grid's hover view explains it, starting on the top-left cell; hovering inside moves the focus.
  await page.locator("[data-testid=live-parity_painter] [data-testid=grid-object]").first().hover();
  const pop = page.locator("[data-testid=grid-object-goal]");
  await pop.waitFor({ timeout: 5000 });
  assert.match(await pop.locator("[data-testid=goal-board-headline]").innerText(), /^Row 1, column 1:/);
  assert.equal(await pop.locator("[data-testid=goal-outcome-table] [data-here]").count(), 1, "the focus's outcome is ringed");
  await pop.locator('[data-cell="2,2"]').hover();
  assert.match(await pop.locator("[data-testid=goal-board-headline]").innerText(), /^Row 3, column 3:/);
  assert.deepEqual(errors, [], "no page errors");
  console.log(`annotations e2e: ok (${families.length} families)`);
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  stop();
}
process.exit(failed ? 1 : 0);
