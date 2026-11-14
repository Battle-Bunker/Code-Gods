/**
 * PROPOSAL storyboards (docs/engine-v2/sharing-rules-design.md): sharing-rules.html on a Vite dev server this script
 * starts, at desktop (1440 px) and phone (390 px). Checks no page errors and no sideways scroll; with an output
 * directory, saves the design's screenshots (deviceScaleFactor 2, JPEG, each under 400 KB).
 *
 *   node --experimental-transform-types e2e/sharing-rules.ts [screenshot dir]
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const OUT = process.argv[2];
const PORT = Number(process.env.PORT_SHARING ?? 22801), BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("npx", ["vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, PORT: String(PORT) }, detached: true,
});
const stop = () => { try { process.kill(-server.pid!, "SIGTERM"); } catch { /* already gone */ } };
await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => { stop(); reject(new Error("vite did not start")); }, 60_000);
  server.stdout.on("data", (d: Buffer) => { if (String(d).includes("ready")) { clearTimeout(t); resolve(); } });
});

const FRAMES = ["show", "received", "suits", "propose", "sentence"];
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
if (OUT) mkdirSync(OUT, { recursive: true });
try {
  const shots: [string, number, string][] = [...FRAMES.flatMap(f => [[f, 1440, "light"], [f, 390, "light"]] as [string, number, string][]), ["suits", 390, "dark"]];
  for (const [frame, width, scheme] of shots) {
    const page = await browser.newPage({ viewport: { width, height: width > 500 ? 900 : 844 }, deviceScaleFactor: 2 });
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.goto(`${BASE}/sharing-rules.html?frame=${frame}&scheme=${scheme}`);
    await page.getByText("Proposal for the owner to decide").waitFor({ timeout: 30_000 });
    await page.waitForTimeout(400);
    assert.deepEqual(errors, [], `${frame} ${width}: no page errors`);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(wide <= 1, `${frame} ${width}: no sideways scroll (${wide} px)`);
    if (OUT) {
      const file = path.join(OUT, `${frame}-${width}${scheme === "dark" ? "-dark" : ""}.jpg`);
      await page.screenshot({ path: file, fullPage: true, type: "jpeg", quality: 70 });
      assert.ok(statSync(file).size <= 400_000, `${file}: ${statSync(file).size} bytes`);
    }
    console.log(`ok ${frame} ${width} ${scheme}`);
    await page.close();
  }
} finally {
  await browser.close();
  stop();
}
