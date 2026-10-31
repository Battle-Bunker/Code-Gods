#!/usr/bin/env node
/**
 * Browser smoke run of dist/template.html against dev/claude-stub.js (a local stand-in for the artifact runtime;
 * it is NOT the claude.ai runtime). Builds first. Needs Playwright with Chromium resolvable by require().
 *
 *   node clients/claude-artifact/smoke.mjs        (or: pnpm run smoke:artifact)
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
execFileSync(process.execPath, [here("./build.mjs")], { stdio: "inherit" });
const { chromium } = createRequire(import.meta.url)("playwright");
const url = pathToFileURL(here("./dist/template.html")).href;
const stub = readFileSync(here("./dev/claude-stub.js"), "utf8");

const browser = await chromium.launch();
let passed = 0;
const step = async (name, fn) => { await fn(); passed++; console.log(`ok ${passed} - ${name}`); };
const open = async ({ stubbed = true, options = {}, viewport = { width: 1100, height: 900 }, scheme = "light" } = {}) => {
  const page = await browser.newPage({ viewport, colorScheme: scheme });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  if (stubbed) { await page.addInitScript(o => { window.__stub = o; }, options); await page.addInitScript(stub); }
  await page.goto(url);
  return { page, errors };
};
const calls = (page, tool) => page.evaluate(t => window.__calls.filter(c => c.tool === t), tool);

try {
  await step("without window.claude the page explains how to connect, and acts are disabled", async () => {
    const { page, errors } = await open({ stubbed: false });
    await page.waitForSelector("#banner:not([hidden])");
    assert.match(await page.textContent("#banner"), /needs the Code Gods connector/);
    assert.equal(await page.isDisabled("#summon"), true);
    assert.equal(await page.isVisible("#ask-section"), false, "Ask Claude is hidden without sample");
    assert.deepEqual(errors, []);
    await page.close();
  });

  const { page, errors } = await open();
  await step("watches whoami and get_observation on the Code Gods connector, every 30 s", async () => {
    await page.waitForSelector("#board tr");
    const watches = await page.evaluate(() => window.__calls.filter(c => c.kind === "watch"));
    assert.deepEqual(watches.map(w => [w.server, w.tool, w.options.refetchInterval]).sort(),
      [["Code Gods", "get_observation", 30000], ["Code Gods", "whoami", 30000]]);
    assert.match(await page.textContent("#who"), /Ada in room ABCD, act access/);
    assert.match(await page.textContent("#fresh"), /Updated/);
  });

  await step("renders the observation: leaderboard with my row, objects by my payoff, agents, phase and clock", async () => {
    assert.deepEqual(await page.$$eval("#board tr", rows => rows.map(r => r.textContent)), ["1Ada12.50", "2Bo (AI)10.00"]);
    assert.equal(await page.getAttribute("#board tr:first-child", "class"), "mine");
    assert.deepEqual(await page.$$eval("#objects tr td:first-child", c => c.map(x => x.textContent)), ["o2", "o1"]);
    assert.match(await page.textContent("#agents"), /cooling down/);
    assert.match(await page.textContent("#stats"), /planning/);
    assert.match(await page.textContent("#stats"), /1:3\d|1:2\d/);
  });

  await step("game strings are text: markup in chat and values is shown, never parsed", async () => {
    assert.match(await page.textContent("#chat"), /<img src=x onerror=/);
    assert.equal(await page.$$eval("#chat img, #objects b", n => n.length), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  });

  await step("chat asks for confirmation, shows the exact text, then sends once with a commandId", async () => {
    await page.fill("#chat-text", "gg all");
    await page.click("#chat-form button[type=submit]");
    await page.waitForSelector("#chat-confirm:not([hidden])");
    assert.equal(await page.textContent("#chat-preview"), "gg all");
    assert.equal((await calls(page, "send_chat")).length, 0, "nothing is sent before the second click");
    await page.click("#chat-send");
    await page.waitForFunction(() => /Done/.test(document.querySelector("#chat-status").textContent));
    const sent = await calls(page, "send_chat");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].input.text, "gg all");
    assert.match(sent[0].input.commandId, /^[0-9a-f-]{36}$/);
    assert.equal(sent[0].options.cache, false);
  });

  await step("an ambiguous summon failure checks get_receipt with the same commandId, then resends the same call on a click", async () => {
    await page.click("#summon");
    await page.waitForSelector("#cmd-action:not([hidden])", { timeout: 10_000 });
    assert.equal(await page.textContent("#cmd-action"), "Resend (same command)");
    assert.equal(await page.isDisabled("#summon"), true, "no new summon while the first one's outcome is open");
    const [first] = await calls(page, "summon_agent");
    const [check] = await calls(page, "get_receipt");
    assert.equal(check.input.commandId, first.input.commandId);
    assert.ok(first.input.waitMs <= 60000);
    await page.click("#cmd-action");
    await page.waitForFunction(() => /Done/.test(document.querySelector("#cmd-status").textContent));
    const summons = await calls(page, "summon_agent");
    assert.equal(summons.length, 2);
    assert.deepEqual(summons[1].input, summons[0].input, "the identical call");
    assert.equal(await page.isDisabled("#summon"), false);
    const inv = await page.evaluate(() => window.__calls.filter(c => c.kind === "invalidate"));
    assert.ok(inv.some(c => c.tool === "get_observation"), "a finished command refreshes the observation");
  });

  await step("validate shows the measured cost", async () => {
    await page.click("#validate");
    await page.waitForFunction(() => /Summon cost 81\.2 bits/.test(document.querySelector("#cmd-status").textContent));
  });

  await step("Refresh invalidates the connector's cache", async () => {
    await page.click("#refresh");
    await page.waitForFunction(() => window.__calls.some(c => c.kind === "invalidate" && c.tool === undefined));
  });

  await step("Ask Claude sends instructions and the observation to sample and shows the answer as text", async () => {
    assert.equal(await page.isVisible("#ask-section"), true);
    await page.fill("#ask-text", "What next?");
    await page.click("#ask-form button[type=submit]");
    await page.waitForFunction(() => /Target o2: it pays you most/.test(document.querySelector("#ask-answer").textContent));
    const [s] = await page.evaluate(() => window.__calls.filter(c => c.kind === "sample"));
    assert.match(s.input, /What next\?/);
    assert.match(s.input, /untrusted/);
    assert.match(s.input, /"label":"Ada"/);
    assert.deepEqual(errors, []);
  });
  await page.close();

  await step("a known receipt after a failure finishes the summon without a resend", async () => {
    const { page: p } = await open({ options: { receiptAfterFailure: "received" } });
    await p.waitForSelector("#board tr");
    await p.click("#summon");
    await p.waitForFunction(() => /Done/.test(document.querySelector("#cmd-status").textContent), null, { timeout: 10_000 });
    assert.equal((await calls(p, "summon_agent")).length, 1);
    await p.close();
  });

  await step("a lost chat locks new messages and offers a resend of the same message and commandId", async () => {
    const { page: p } = await open({ options: { chatFailsOnce: true } });
    await p.waitForSelector("#board tr");
    await p.fill("#chat-text", "hi");
    await p.click("#chat-open");
    await p.click("#chat-send");
    await p.waitForSelector("#chat-action:not([hidden])", { timeout: 10_000 });
    assert.equal(await p.textContent("#chat-action"), "Resend (same command)");
    assert.equal(await p.isDisabled("#chat-open"), true, "no second message while the first one's outcome is open");
    await p.click("#chat-action");
    await p.waitForFunction(() => /Done/.test(document.querySelector("#chat-status").textContent));
    const sent = await calls(p, "send_chat");
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[1].input, sent[0].input);
    assert.equal(await p.isDisabled("#chat-open"), false);
    await p.close();
  });

  await step("phone width, dark scheme: no horizontal page scroll, Ask hidden without sample", async () => {
    const { page: p, errors: e } = await open({ viewport: { width: 390, height: 844 }, scheme: "dark", options: { noSample: true } });
    await p.waitForSelector("#board tr");
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), "no page-level horizontal scroll");
    assert.equal(await p.isVisible("#ask-section"), false);
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, "rgb(19, 18, 28)", "dark tokens apply");
    if (process.env.SMOKE_SCREENSHOT) await p.screenshot({ path: process.env.SMOKE_SCREENSHOT, fullPage: true });
    assert.deepEqual(e, []);
    await p.close();
  });
  await step("probe.html runs every check and reports them (a plain local page allows them all)", async () => {
    const p = await browser.newPage();
    await p.goto(pathToFileURL(here("./probe.html")).href);
    const summary = await p.waitForFunction(() => window.__probe, null, { timeout: 30_000 }).then(h => h.jsonValue());
    assert.equal(summary.results.length, 10);
    assert.deepEqual(summary.results.filter(r => !r.ok), []);
    assert.equal(summary.panelsPossible, true);
    assert.match(await p.textContent("#summary"), /could run here/);
    await p.close();
  });
  console.log(`# pass ${passed}`);
} finally {
  await browser.close();
}
