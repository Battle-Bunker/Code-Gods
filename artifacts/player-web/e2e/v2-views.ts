/**
 * The engine v2 views gallery in a browser (v2-views.html on a Vite dev server this script starts), at phone (390 px)
 * and desktop (1440 px) widths, light and dark. Checks what only a browser can: no page errors, no sideways scroll, a
 * narrow card shows only the chosen representation, pointing at a number lights the same quantity in another view, and
 * pointing at a part leaves only its marks. With an output directory, saves screenshots of every section.
 *
 *   node --experimental-transform-types e2e/v2-views.ts [screenshot dir]
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";

const OUT = process.argv[2];
const PORT = Number(process.env.PORT_V2_VIEWS ?? 22797), BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("npx", ["vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, PORT: String(PORT) }, detached: true,
});
const stop = () => { try { process.kill(-server.pid!, "SIGTERM"); } catch { /* already gone */ } };
await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => { stop(); reject(new Error("vite did not start")); }, 60_000);
  server.stdout.on("data", (d: Buffer) => { if (String(d).includes("ready")) { clearTimeout(t); resolve(); } });
});

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch().catch((e: unknown) => { stop(); throw e; });
try {
  if (OUT) mkdirSync(OUT, { recursive: true });
  for (const width of [390, 1440]) {
    for (const scheme of ["light", "dark"] as const) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      await page.goto(`${BASE}/v2-views.html?scheme=${scheme}`);
      await page.locator(".v2v-expanded").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.deepEqual(errors, [], `${width} ${scheme}: page errors`);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(sideways <= 0, `${width} ${scheme}: the page scrolls sideways by ${sideways}px`);

      const face = page.locator("[data-section=families] .v2v-expanded").first();
      const shown = async () => face.locator(".v2v-panel").evaluateAll(es => es.filter(e => getComputedStyle(e).display !== "none").length);
      if (width < 700) {
        assert.equal(await shown(), 1, "a narrow card shows one representation");
        await face.locator(".v2v-tab", { hasText: "slope-intercept" }).click();
        assert.equal(await shown(), 1, "a tab switches the one representation shown");
      } else {
        assert.ok(await shown() >= 2, "a wide card shows the rule's representations side by side");
      }
      // Pointing at the y-intercept in the equation lights it on the plane too (meaning yIntercept).
      await face.locator('[data-rep="si"] [data-ref="si.c"]').hover();
      const lit = await face.locator("[data-lit]").evaluateAll(es => es.map(e => e.getAttribute("data-ref")));
      assert.ok(lit.includes("si.c") && lit.includes("cart.yInt"), `cross-highlight lit ${lit}`);
      // Pointing at the tie-breaker leaves only its marks: no gap bracket.
      await face.locator(".v2v-part").nth(1).hover();
      assert.equal(await face.locator('[data-mark="measure"]').count(), 0, "the tie-breaker's marks only");
      await page.mouse.move(0, 0);

      if (OUT) {
        // The long families section only twice (desktop light, phone dark) to keep the repository small.
        const long = (width === 1440 && scheme === "light") || (width === 390 && scheme === "dark");
        for (const section of long ? ["story", "families", "dealt"] : ["story", "dealt"]) {
          const s = page.locator(`[data-section=${section}]`);
          await s.screenshot({ path: `${OUT}/${section}-${width}-${scheme}.png` });
        }
      }
      await page.close();
      console.log(`ok ${width} ${scheme}`);
    }
  }
} finally {
  await browser.close();
  stop();
}
