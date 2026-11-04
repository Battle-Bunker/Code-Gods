/**
 * Goal annotations in a browser (docs/annotations-design.md): the gallery page (annotations.html) on a Vite dev server
 * this script starts. Checks what only a browser shows: each annotated family's goal-card example lists its scoring
 * units (gains first, a list that scrolls inside a fixed height); hovering a unit's box draws its region on the board
 * and an arrow; hovering the board picks the unit under the pointer in the chosen hover mode and marks its box; arrow
 * keys step through the units; a compact grid's hover view explains it the same way.
 *
 *   node --experimental-transform-types e2e/annotations.ts
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const PORT = Number(process.env.PORT_ANNOTATIONS ?? 22795), BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("npx", ["vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, PORT: String(PORT) }, detached: true,
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
    const units = board.locator("[data-testid=goal-units]");
    const tones = await units.locator("[data-testid=goal-unit]").evaluateAll(els => els.map(e => e.getAttribute("data-tone")!));
    assert.ok(tones.length > 0, `${f}: the units are listed`);
    const rank = (t: string) => ({ gain: 0, loss: 1, zero: 2 } as Record<string, number>)[t];
    assert.deepEqual(tones, [...tones].sort((x, y) => rank(x) - rank(y)), `${f}: gains first, then losses, then zeros`);
    assert.equal(await units.evaluate(el => getComputedStyle(el).overflowY), "auto", `${f}: the list scrolls inside`);
    assert.ok((await units.boundingBox())!.height <= 22 * 16 + 1, `${f}: the list keeps its maximum height`);
    // Every annotated family explains its bits: raw parts, the share of boards, then −log₂(P) with the same P.
    const how = board.locator("[data-testid=how-this-scores]");
    assert.equal(await how.count(), 1, `${f}: "How this scores" is shown`);
    const rarity = await how.locator("[data-testid=how-rarity]").innerText(), bits = await how.locator("[data-testid=how-bits]").innerText();
    const p = /P = (\d\.\d+)/.exec(rarity)?.[1];
    assert.ok(p, `${f}: shows P (${rarity})`);
    assert.ok(bits.includes(`−log₂(${p})`), `${f}: the bits line uses the same P (${bits})`);
    if (f === "number_bonds") await how.screenshot({ path: process.env.HOW_SHOT ?? "/tmp/how-number-bonds.png" });
  }

  // A family without a lens: the board and its score, no breakdown, no crash.
  const plain = page.locator("[data-testid=example-plain]");
  assert.equal(await plain.getAttribute("data-rich"), null);
  assert.match(await plain.locator("[data-testid=goal-board-total]").innerText(), /^This board: \d+ points?/);
  assert.equal(await plain.locator("[data-testid=goal-unit]").count(), 0);

  // Set Spotter: four hover modes, one per direction; the board picks the trio centred under the pointer.
  const set = page.locator("[data-testid=example-set_spotter]");
  assert.deepEqual(await set.locator("[data-testid=goal-hover-modes] button").allInnerTexts(), ["→", "↓", "↘", "↙"]);
  await set.locator("[data-testid=goal-hover-mode-down]").click();
  await set.locator('[data-cell="1,1"]').hover();
  assert.equal(await set.locator("[data-testid=goal-unit][data-selected]").getAttribute("data-part"), "trio:0,1:down", "the ↓ trio centred on (1,1)");
  assert.equal(await set.locator('svg path[data-part="trio:0,1:down"]').count(), 1, "its region is drawn on the board");
  assert.equal(await set.locator("[data-testid=goal-unit-arrow]").count(), 1, "an arrow joins it to its box");
  // Hovering a box selects its unit: the board draws that unit.
  const second = set.locator("[data-testid=goal-unit]").nth(1);
  await second.hover();
  const id = await second.getAttribute("data-part");
  assert.equal(await set.locator(`svg path[data-part="${id}"]`).count(), 1);
  // Keyboard on Chessmaster: stepping onto a touching pair switches the hover toggle to pairs, as picking it in the list does.
  {
    const chess = page.locator("[data-testid=example-chessmaster]");
    await page.mouse.move(0, 0); // keyboard only: no pointer resting on a board
    await chess.locator("[data-testid=goal-board-grid]").focus();
    await page.keyboard.press("Home");
    for (let k = 0; k < 40; k++) {
      const id = await chess.locator("[data-testid=goal-unit][data-selected]").getAttribute("data-part");
      if (id!.startsWith("seam:")) break;
      await page.keyboard.press("ArrowDown");
    }
    assert.match((await chess.locator("[data-testid=goal-unit][data-selected]").getAttribute("data-part"))!, /^seam:/);
    assert.equal(await chess.locator("[data-testid=goal-hover-mode-pair]").getAttribute("aria-checked"), "true", "the toggle follows the keyboard");
  }
  // Keyboard: the board steps through the units in list order.
  await page.mouse.move(0, 0); // keyboard only: no pointer resting on a board
  await set.locator("[data-testid=goal-board-grid]").focus();
  await page.keyboard.press("Home");
  const first = await set.locator("[data-testid=goal-unit]").first().getAttribute("data-part");
  assert.equal(await set.locator("[data-testid=goal-unit][data-selected]").getAttribute("data-part"), first);
  await page.keyboard.press("ArrowDown");
  assert.equal(await set.locator("[data-testid=goal-unit][data-selected]").getAttribute("data-part"), await set.locator("[data-testid=goal-unit]").nth(1).getAttribute("data-part"));

  // A compact grid's hover view explains it by unit too; hovering inside picks the cell's unit.
  await page.locator("[data-testid=live-parity_painter] [data-testid=grid-object]").first().hover();
  const pop = page.locator("[data-testid=grid-object-goal]");
  await pop.waitFor({ timeout: 5000 });
  assert.ok(await pop.locator("[data-testid=goal-unit]").count() > 0);
  await pop.locator('[data-cell="2,2"]').hover();
  assert.equal(await pop.locator("[data-testid=goal-unit][data-selected]").getAttribute("data-part"), "cell:2,2");
  // Mode 1, the part scrubber: stepping to the last piece counts the board's whole score.
  const scrub = page.locator("[data-mode=scrubber]");
  const total = await scrub.locator("[data-testid=goal-board-total] b").innerText();
  while (!(await scrub.locator("[data-testid=button-step-next]").isDisabled())) await scrub.locator("[data-testid=button-step-next]").click();
  assert.equal(await scrub.locator("[data-testid=scrubber-sofar]").innerText(), total, "the running total ends on the board's score");
  // Mode 2, what if: pointing at a change previews its score.
  const what = page.locator("[data-mode=whatif]");
  const cell = what.locator("[data-testid=what-if-table] td:not([data-current])").first();
  await cell.hover();
  assert.match(await what.locator("[data-testid=what-if-score]").innerText(), /^With this change: \d+ points/);
  // Mode 3, the story: its last step gives the score.
  const tale = page.locator("[data-mode=story]");
  while (!(await tale.locator("[data-testid=button-step-next]").isDisabled())) await tale.locator("[data-testid=button-step-next]").click();
  assert.match(await tale.locator("[data-testid=story-points]").innerText(), /^Score: \d+ points?/);
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
