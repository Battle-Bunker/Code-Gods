/**
 * Grid glyphs in a browser: the gallery page (glyphs.html) on a Vite dev server this script starts. Checks what only a
 * browser can: in every card grid every cell is the same width, so each column is the same width in every row, and a
 * grid with tens is exactly as wide as one without (the single-cell ten, lib/object-views glyph.tsx); the same for the
 * letter cue and the tiles' ranks. With an output directory, also saves screenshots of the gallery.
 *
 *   node --experimental-transform-types e2e/grid-glyphs.ts [screenshot dir] [label]
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";

const OUT = process.argv[2], LABEL = process.argv[3] ?? "after";
const PORT = Number(process.env.PORT_GLYPHS ?? 22796), BASE = `http://127.0.0.1:${PORT}`;
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
let failed = false;
const round = (x: number) => Math.round(x * 100) / 100;
const browser = await chromium.launch().catch((e: unknown) => { stop(); throw e; });
try {
  if (OUT) mkdirSync(OUT, { recursive: true });
  for (const cue of ["pattern", "letter"] as const) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${BASE}/glyphs.html?cue=${cue}`);
    await page.locator("[data-ready]").waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const scheme of ["light", "dark"]) {
      const panel = page.locator(`[data-scheme=${scheme}]`);
      const widths: Record<string, number> = {};
      for (const fig of await panel.locator("[data-board]").all()) {
        const id = (await fig.getAttribute("data-board"))!;
        const grid = fig.locator("[data-renderer=digits] > [data-cell], [data-renderer=tiles] [data-cell]");
        // Each cell's left, right and width, and its glyph's rank box; the grid's columns from its template.
        const cells = await grid.evaluateAll(els => els.map(e => {
          const r = e.getBoundingClientRect(), rank = e.querySelector("[data-rank]")?.getBoundingClientRect();
          return { x: r.x, w: r.width, rank: rank?.width ?? -1 };
        }));
        const n = Math.round(Math.sqrt(cells.length));
        assert.equal(n * n, cells.length, `${scheme} ${id}: a square grid (${cells.length} cells)`);
        const ranks = new Set(cells.map(c => round(c.rank)));
        assert.equal(ranks.size, 1, `${scheme} ${cue} ${id}: every rank box is one width (${[...ranks]})`);
        for (let k = 0; k < n; k++) {
          const col = cells.filter((_, i) => i % n === k);
          const ws = new Set(col.map(c => round(c.w))), xs = new Set(col.map(c => round(c.x)));
          assert.equal(ws.size, 1, `${scheme} ${cue} ${id}: column ${k + 1} has one width in every row (${[...ws]})`);
          assert.equal(xs.size, 1, `${scheme} ${cue} ${id}: column ${k + 1} starts at one x in every row (${[...xs]})`);
        }
        widths[id] = round((await fig.locator("[data-testid=grid-object]").boundingBox())!.width);
      }
      for (const r of ["digits", "tiles"]) {
        assert.equal(widths[`cards-tens-${r}`], widths[`cards-no-tens-${r}`], `${scheme} ${cue}: a 7×7 card grid with tens is as wide as one without (${r})`);
      }
    }
    if (OUT) {
      for (const scheme of ["light", "dark"]) {
        await page.locator(`[data-scheme=${scheme}]`).screenshot({ path: `${OUT}/${LABEL}-${cue}-${scheme}.png` });
      }
      // The rich popover of the 7×7 grid with tens.
      if (cue === "pattern") {
        await page.locator("[data-board=cards-tens-digits] [data-testid=grid-object]").first().click();
        const pop = page.locator("[data-testid=grid-object-detail]");
        await pop.waitFor();
        await pop.screenshot({ path: `${OUT}/${LABEL}-popover.png` });
      }
    }
    assert.deepEqual(errors, [], "no page errors");
    await page.close();
  }
  console.log("grid glyphs e2e: ok");
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  stop();
}
process.exit(failed ? 1 : 0);
