/**
 * A look at every in-game pane and the end page at phone widths (360 and 414): screenshots, and what is worse than it
 * should be: the page scrolling sideways, an element wider than its pane, text cut by an ellipsis, a control smaller
 * than 24 px. Not a pass/fail suite: it prints what it finds for a person to look at (SHOTS_DIR keeps the pictures).
 * Taps, not clicks: a mouse click turns Chromium's emulated pointer fine, and the page's touch rules with it.
 *
 *   pnpm --filter @workspace/player-web exec node --experimental-transform-types e2e/phone-audit.ts
 */
import "../../engine/scripts/local-only.mjs";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
type Page = any;
const SITE = process.env.CODE_GODS_SITE_URL ?? "http://127.0.0.1:3211";
const CLOUD = "http://127.0.0.1:3210";
const shots = process.env.SHOTS_DIR ?? path.join(import.meta.dirname, "shots", "phone-audit");
mkdirSync(shots, { recursive: true });
const PANES = ["overview", "my-card", "objects", "what-if", "feed", "agents", "forge", "race", "public-chat", "others-care", "points-over-time", "rules", "my-panels"];

async function findings(page: Page, root: string) {
  return page.evaluate((sel: string) => {
    const box = document.querySelector(sel) as HTMLElement | null;
    if (!box) return ["(pane not found)"];
    const out: string[] = [];
    const paneRight = box.getBoundingClientRect().right + 1;
    const label = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} "${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50)}"`;
    for (const el of box.querySelectorAll("*")) {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (r.right > paneRight + 2 && cs.position !== "fixed") out.push(`wider than the pane (${Math.round(r.right - paneRight)} px): ${label(el)}`);
      if (cs.textOverflow === "ellipsis" && (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1) out.push(`cut with …: ${label(el)}`);
      if ((el.tagName === "BUTTON" || el.tagName === "A" || el.tagName === "SELECT" || (el as HTMLElement).getAttribute("role") === "button") && (r.height < 24 || r.width < 24)) out.push(`small target ${Math.round(r.width)}×${Math.round(r.height)} (display ${cs.display}, min-height ${cs.minHeight}): ${label(el)}`);
    }
    return [...new Set(out)];
  }, root);
}

const browser = await chromium.launch();
for (const width of [360, 414]) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${SITE}/`);
  await page.getByTestId("button-login").waitFor();
  const url = await page.evaluate(async () => ((await (await fetch("/api/auth/sign-in/oauth2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: "fake", callbackURL: "/" }) })).json()) as { url: string }).url);
  await page.goto(url);
  await page.getByRole("link", { name: /\(carol\)/ }).tap();
  await page.waitForURL(`${SITE}/`);
  await page.getByTestId("button-create-room").first().tap();
  await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
  const code = page.url().split("/").at(-1)!;
  const token = await page.evaluate(async () => ((await (await fetch("/api/auth/convex/token")).json()) as { token: string }).token);
  const client = new ConvexHttpClient(CLOUD); client.setAuth(token);
  const room = await client.query("v2/rooms:byCode" as never, { code } as never) as { roomId: string };
  await client.mutation("v2/ops/room:settings" as never, { args: { overrides: { planningSeconds: 60, worldSeconds: 45 } }, roomId: room.roomId } as never);
  await page.getByTestId("button-practice-game").tap();
  await page.waitForURL(/\/games\//, { timeout: 30_000 });
  await page.getByTestId("button-summon-first").tap();
  await page.getByTestId("text-forge-status").getByText(/is summoned/).waitFor({ timeout: 60_000 });
  const startNow = page.getByTestId("button-start-world");
  if (await startNow.count()) { await startNow.tap(); await startNow.tap().catch(() => {}); }
  await page.locator("[data-testid^=row-line-]").first().waitFor({ timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`\n=== ${width}px live; page sideways scroll: ${overflow}px`);
  for (const pane of PANES) {
    if (!await page.getByTestId(`pane-${pane}`).count()) {
      const menu = page.locator("[data-testid^=button-pane-menu-]").first();
      await menu.tap().catch(() => {});
      const item = page.getByTestId(`button-open-pane-${pane}`);
      if (await item.count()) await item.tap(); else await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
    }
    const sec = page.getByTestId(`pane-${pane}`);
    if (!await sec.count()) { console.log(`- ${pane}: not opened`); continue; }
    await sec.scrollIntoViewIfNeeded();
    await sec.screenshot({ path: path.join(shots, `${width}-${pane}.png`) }).catch(() => {});
    const f = await findings(page, `[data-testid="pane-${pane}"]`);
    console.log(`- ${pane}: ${f.length ? "\n    " + f.slice(0, 12).join("\n    ") : "ok"}`);
  }
  // A line's detail: the overlay a tap on its face opens.
  const face = page.locator("[data-testid^=marks-line-]").first();
  if (await face.count()) {
    await face.scrollIntoViewIfNeeded();
    await face.tap();
    const detail = page.getByTestId("object-hover-detail");
    if (await detail.waitFor({ timeout: 10_000 }).then(() => true, () => false)) {
      await detail.screenshot({ path: path.join(shots, `${width}-object-overlay.png`) }).catch(() => {});
      const f = await findings(page, '[data-testid="object-hover-detail"]');
      console.log(`- object overlay: ${f.length ? "\n    " + f.slice(0, 12).join("\n    ") : "ok"}`);
      await page.keyboard.press("Escape");
    } else console.log("- object overlay: did not open on a tap");
  }
  // The end page.
  await page.getByTestId("text-phase").filter({ hasText: /ended/i }).waitFor({ timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const res = page.getByTestId("pane-results");
  if (await res.count()) {
    await res.screenshot({ path: path.join(shots, `${width}-results.png`) }).catch(() => {});
    const f = await findings(page, '[data-testid="pane-results"]');
    console.log(`- results: ${f.length ? "\n    " + f.slice(0, 12).join("\n    ") : "ok"}`);
  }
  console.log(`  ended page sideways scroll: ${await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)}px`);
  await context.close();
}
await browser.close();
