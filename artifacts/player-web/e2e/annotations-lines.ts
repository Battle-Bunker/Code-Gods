/**
 * The line annotations storyboards (docs/engine-v2/annotations-design.md §9) in a browser: annotations-lines.html on a
 * Vite dev server this script starts, at desktop (1440 px) and phone (390 px), light and dark. Checks what only a
 * browser can: no page errors, no sideways scroll, a tap on a contributor selects it (a chip says so and ✕ clears it),
 * a phone selection shows the lit twin in a second, stacked view, and compare keeps the rule's main view. With an
 * output directory, saves the design document's screenshots (deviceScaleFactor 2, each under 400 KB).
 *
 *   node --experimental-transform-types e2e/annotations-lines.ts [screenshot dir]
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const OUT = process.argv[2];
const PORT = Number(process.env.PORT_ANNOTATIONS ?? 22799), BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("npx", ["vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, PORT: String(PORT) }, detached: true,
});
const stop = () => { try { process.kill(-server.pid!, "SIGTERM"); } catch { /* already gone */ } };
await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => { stop(); reject(new Error("vite did not start")); }, 60_000);
  server.stdout.on("data", (d: Buffer) => { if (String(d).includes("ready")) { clearTimeout(t); resolve(); } });
});

/** [file, query, width, scheme] */
const SHOTS: [string, string, number, "light" | "dark"][] = [
  ["prime-landing-1440-light", "rule=prime-landing&frame=line", 1440, "light"],
  ["prime-landing-select-390-dark", "rule=prime-landing&frame=select", 390, "dark"],
  ["square-area-1440-light", "rule=square-area&frame=line", 1440, "light"],
  ["square-area-390-light", "rule=square-area&frame=line", 390, "light"],
  ["whole-crossing-1440-light", "rule=whole-crossing&frame=line", 1440, "light"],
  ["whole-crossing-compare-1440-dark", "rule=whole-crossing&frame=compare", 1440, "dark"],
  ["treasure-1440-light", "rule=treasure&frame=line", 1440, "light"],
  ["treasure-others-1440-light", "rule=treasure&frame=others", 1440, "light"],
  ["treasure-390-dark", "rule=treasure&frame=line", 390, "dark"],
  ["divisibility-ladder-1440-light", "rule=divisibility-ladder&frame=line", 1440, "light"],
  ["scale-1440-light", "rule=scale", 1440, "light"],
  ["compact-1440-light", "rule=prime-landing&frame=compact", 1440, "light"],
  ["compact-390-dark", "rule=treasure&frame=compact", 390, "dark"],
  ["goal-1440-light", "rule=prime-landing&frame=goal", 1440, "light"],
];
const MAX = 400 * 1024;

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch().catch((e: unknown) => { stop(); throw e; });
try {
  if (OUT) mkdirSync(OUT, { recursive: true });
  for (const [file, query, width, scheme] of SHOTS) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: OUT ? 2 : 1 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`${BASE}/annotations-lines.html?${query}&scheme=${scheme}`);
    await page.locator(".la-oneline, .la-compact, .la-goal").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(errors, [], `${file}: page errors`);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(sideways <= 0, `${file}: the page scrolls sideways by ${sideways}px`);

    if (file === "prime-landing-1440-light") {
      // A tap (click) on the main contributor selects it; the chip says so; ✕ clears it.
      const card = page.locator(".la-card[data-role=main]").first();
      await card.click();
      assert.equal(await page.locator(".la-selchip").count(), 1, "a tap selects the contributor");
      await page.locator(".la-selchip button").click();
      assert.equal(await page.locator(".la-selchip").count(), 0, "✕ clears the selection");
    }
    if (file === "prime-landing-select-390-dark") {
      const panels = await page.locator(".la-panel").count();
      assert.ok(panels >= 2, "a phone selection shows a second, stacked view so the lit twin is visible");
      assert.equal(await page.locator(".la-view-row[data-stacked]").count(), 1, "views stack on a phone");
    }
    if (file === "whole-crossing-compare-1440-dark") {
      const titles = await page.locator(".la-panel h4").allTextContents();
      assert.ok(titles.some(t => t.includes("your rule's main view")), "compare keeps the rule's main view");
    }

    if (OUT) {
      const target = page.locator(".la-page");
      let buf = await target.screenshot({ type: "png" });
      let ext = "png";
      if (buf.length > MAX) {
        for (const quality of [82, 70, 58, 48, 40]) { buf = await target.screenshot({ type: "jpeg", quality }); ext = "jpg"; if (buf.length <= MAX) break; }
      }
      assert.ok(buf.length <= MAX, `${file}: ${buf.length} bytes`);
      writeFileSync(`${OUT}/${file}.${ext}`, buf);
      console.log(`${file}.${ext} ${Math.round(statSync(`${OUT}/${file}.${ext}`).size / 1024)} KB`);
    }
    await page.close();
    console.log(`ok ${file}`);
  }
} finally {
  await browser.close();
  stop();
}
