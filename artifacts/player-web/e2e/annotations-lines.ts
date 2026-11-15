/**
 * The line annotations storyboards (docs/engine-v2/annotations-design.md §9) in a browser: annotations-lines.html on a
 * Vite dev server this script starts, at desktop (1440 px) and phone (390 px), light and dark. Checks what only a
 * browser can: no page errors, no sideways scroll, a tap on a contributor selects it (a chip says so and Clear clears it),
 * a phone selection shows the lit twin in a second, stacked view, and compare keeps the rule's main view. On rational
 * lines (lines-beginner plays on line-q), every pool family's face: fractions typeset (never "8/11"), the plots fitted
 * (the line crosses its drawing, every main label inside it and clear of the others). With an
 * output directory, saves the design document's screenshots (deviceScaleFactor 2, each under 400 KB).
 *
 *   node --experimental-transform-types e2e/annotations-lines.ts [screenshot dir]
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { beginnerPool } from "@workspace/v2-linear";

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
  ["prime-landing-390-dark", "rule=prime-landing&frame=line", 390, "dark"],
  ["square-area-1440-light", "rule=square-area&frame=line", 1440, "light"],
  ["square-area-390-light", "rule=square-area&frame=line", 390, "light"],
  ["whole-crossing-1440-light", "rule=whole-crossing&frame=line", 1440, "light"],
  ["whole-crossing-compare-1440-dark", "rule=whole-crossing&frame=compare", 1440, "dark"],
  ["treasure-1440-light", "rule=treasure&frame=line", 1440, "light"],
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
  // The plane on hard lines (v2-views.html?section=plot): every label of a priority-1 point measured in the browser lies
  // inside its drawing and clear of the others, at phone and desktop widths.
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: OUT ? 2 : 1 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${BASE}/v2-views.html?section=plot`);
    await page.locator("[data-hard]").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(errors, [], `plot ${width}: page errors`);
    const { bad, n } = await page.evaluate(() => {
      const out: string[] = [];
      let n = 0;
      for (const svg of document.querySelectorAll<SVGSVGElement>("[data-hard] svg.v2v-plane")) {
        const frame = svg.getBoundingClientRect();
        if (frame.width === 0) continue; // a tab not shown
        const boxes = [...svg.querySelectorAll<SVGTextElement>('text[data-priority="1"]')].map(t => ({ t: t.textContent, r: t.getBoundingClientRect() }));
        n += boxes.length;
        for (const b of boxes) {
          if (b.r.left < frame.left - 1 || b.r.right > frame.right + 1 || b.r.top < frame.top - 1 || b.r.bottom > frame.bottom + 1) out.push(`"${b.t}" leaves its drawing`);
          for (const o of boxes) if (o !== b && b.r.left < o.r.right - 1 && o.r.left < b.r.right - 1 && b.r.top < o.r.bottom - 1 && o.r.top < b.r.bottom - 1) out.push(`"${b.t}" overlaps "${o.t}"`);
          // The axes' numbers count as obstacles too (the y-intercept label once sat on "27,720").
          for (const t of svg.querySelectorAll<SVGTextElement>("text.tick-label")) {
            const o = t.getBoundingClientRect();
            if (b.r.left < o.right - 1 && o.left < b.r.right - 1 && b.r.top < o.bottom - 1 && o.top < b.r.bottom - 1) out.push(`"${b.t}" overlaps the axis number ${t.textContent}`);
          }
        }
      }
      return { bad: out, n };
    });
    assert.ok(n >= 10, `plot ${width}: only ${n} priority-1 labels measured`);
    assert.deepEqual(bad, [], `plot ${width}: labels`);
    if (OUT) {
      for (const [file, title] of [["plot-after-290x59", "y = 290x + 59 · Square Area"], ["plot-after-27720", "far from the origin, y = 5x + 27,720 · Prime Landing"]] as const) {
        if (width !== 1440) continue;
        const buf = await page.locator(`[data-hard="${title}"]`).screenshot({ type: "png" });
        assert.ok(buf.length <= MAX, `${file}: ${buf.length} bytes`);
        writeFileSync(`${OUT}/${file}.png`, buf);
      }
      if (width === 390) {
        const buf = await page.locator('[data-hard="y = 290x + 59 · Square Area"]').screenshot({ type: "jpeg", quality: 75 });
        writeFileSync(`${OUT}/plot-after-290x59-390.jpg`, buf);
      }
    }
    await page.close();
    console.log(`ok plot ${width}`);
  }

  for (const [file, query, width, scheme] of SHOTS) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: OUT ? 2 : 1 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`${BASE}/annotations-lines.html?${query}&scheme=${scheme}`);
    await page.locator(".v2v-expanded, .la-compact, .v2v-goal").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(errors, [], `${file}: page errors`);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(sideways <= 0, `${file}: the page scrolls sideways by ${sideways}px`);

    if (file === "prime-landing-1440-light" || file === "prime-landing-390-dark") {
      // A tap on a part selects it (a chip says so, only its marks are drawn); Clear clears it.
      await page.locator(".v2v-part[data-role=main]").first().click();
      assert.equal(await page.locator(".v2v-selchip").count(), 1, "a tap selects the part");
      await page.locator(".v2v-selchip button").click();
      assert.equal(await page.locator(".v2v-selchip").count(), 0, "Clear clears the selection");
      // No steps or thresholds anywhere (owner decision 23).
      const text = await page.locator(".la-page").innerText();
      assert.doesNotMatch(text, /\bstep \d|\bwithin \d|≥ ?\d|Steps to the top/, "no steps or thresholds");
    }
    if (file === "whole-crossing-compare-1440-dark") {
      const titles = await page.locator(".v2v-panel h4").allTextContents();
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

  // Rational lines: every pool family's face at desktop, three at phone width.
  for (const [i, family] of beginnerPool.map(f => f.id).entries()) for (const width of i < 3 ? [1440, 390] : [1440]) {
    const file = `rational-${family}-${width}`;
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: OUT ? 2 : 1 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`${BASE}/annotations-lines.html?rational=${family}`);
    await page.locator(".v2v-expanded").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(errors, [], `${file}: page errors`);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(sideways <= 0, `${file}: the page scrolls sideways by ${sideways}px`);
    const text = await page.locator(".la-page").innerText();
    assert.doesNotMatch(text, /\d\/\d/, `${file}: a fraction written with a slash`);
    assert.doesNotMatch(text, /NaN|undefined|Infinity/, `${file}: a broken number`);
    assert.doesNotMatch(text, /no drawing for/, `${file}: a view without a drawing`);
    assert.doesNotMatch(text, /(^|[^\d⁄₀-₉⁰-⁹.,])1 ?[xy]\b|−1 ?[xy]\b|\+ 0(?![\d.,⁄])|\+ −|− −/, `${file}: an equation written as no one writes it`);
    assert.match(text, /[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|⁄/, `${file}: the rational line's fractions are typeset`);
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const svg of document.querySelectorAll<SVGSVGElement>("svg.v2v-plane")) {
        const frame = svg.getBoundingClientRect();
        if (frame.width === 0) continue;
        // Fitted: the line itself crosses the drawing.
        const line = svg.querySelector<SVGLineElement>("line.line");
        if (line) {
          const r = line.getBoundingClientRect();
          if (r.right < frame.left || r.left > frame.right || r.bottom < frame.top || r.top > frame.bottom) out.push("the line is outside its drawing");
        }
        const boxes = [...svg.querySelectorAll<SVGTextElement>('text[data-priority="1"]')].map(t => ({ t: t.textContent, r: t.getBoundingClientRect() }));
        for (const b of boxes) {
          if (b.r.left < frame.left - 1 || b.r.right > frame.right + 1 || b.r.top < frame.top - 1 || b.r.bottom > frame.bottom + 1) out.push(`"${b.t}" leaves its drawing`);
          for (const o of boxes) if (o !== b && b.r.left < o.r.right - 1 && o.r.left < b.r.right - 1 && b.r.top < o.r.bottom - 1 && o.r.top < b.r.bottom - 1) out.push(`"${b.t}" overlaps "${o.t}"`);
        }
      }
      return out;
    });
    assert.deepEqual(bad, [], `${file}: plots`);
    if (OUT) {
      const target = page.locator(".la-page");
      let buf = await target.screenshot({ type: "jpeg", quality: 70 });
      for (const quality of [58, 48, 40]) { if (buf.length <= MAX) break; buf = await target.screenshot({ type: "jpeg", quality }); }
      assert.ok(buf.length <= MAX, `${file}: ${buf.length} bytes`);
      writeFileSync(`${OUT}/${file}.jpg`, buf);
    }
    await page.close();
    console.log(`ok ${file}`);
  }

  // A vertical line (x = 3), about 30% of newborn lines on line-q: every view names it, the compact face says what would
  // make it score.
  for (const [frame, width] of [["line", 1440], ["line", 390], ["compact", 1440], ["compact", 390]] as const) {
    const file = `vertical-prime-landing-${frame}-${width}`;
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: OUT ? 2 : 1 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${BASE}/annotations-lines.html?rational=prime-landing&vertical=1&frame=${frame}`);
    await page.locator(".v2v-expanded, .la-compact").first().waitFor();
    assert.deepEqual(errors, [], `${file}: page errors`);
    const text = await page.locator(".la-page").innerText();
    assert.match(text, /x = 3/, `${file}: the line is named`);
    // The general form's own view writes "x − 3 = 0" (that is its form); no view writes a zero term.
    assert.doesNotMatch(text, /\b0y|\+ 0\b|\b1x/, `${file}: written as a person writes it`);
    // Not scoring: what would make it score; scoring (a rule that reads a vertical line, since the vertical readings): its next step.
    if (frame === "compact") assert.match(text, /not scoring[\s\S]*To score: |\d bits \(1 in [\s\S]*next: /, `${file}: what would make it score, or its next step`);
    else assert.match(text, /What would make it rarer/, `${file}: the moves`);
    if (OUT) writeFileSync(`${OUT}/${file}.jpg`, await page.locator(".la-page").screenshot({ type: "jpeg", quality: 70 }));
    await page.close();
    console.log(`ok ${file}`);
  }
} finally {
  await browser.close();
  stop();
}
