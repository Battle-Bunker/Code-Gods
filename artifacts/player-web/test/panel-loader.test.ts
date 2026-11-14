/**
 * Loading a stored panel's compiled code in its frame (src/frame/loader.ts): only react and the v2 SDK can be
 * required, a panel written for the first engine's SDK is refused with a reason, and a version is evaluated once.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createLoader, sdkNamesUsed } from "../src/frame/loader.ts";
import { definePanel, PANEL_SDK } from "../src/sdk/panel.ts";

const sdk = { definePanel, useGame: () => "game", useLeaderboard: () => null };
const modules = { react: { createElement: () => null }, "react/jsx-runtime": { jsx: () => null }, "@sdk": sdk };
const panel = (compiled: string, version = 1) => ({ slug: "my-stats", version, compiled, title: "My stats" });

// What the server's compiler (TypeScript, CommonJS, react-jsx) makes of a small panel.
const GOOD = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const sdk_1 = require("@sdk");
function Stats() { const g = (0, sdk_1.useGame)(); return (0, jsx_runtime_1.jsx)("p", { children: g }); }
exports.default = (0, sdk_1.definePanel)({ title: "My stats", Component: Stats });
`;

test("a v2 panel loads as its definition, stamped with the SDK version", () => {
  const out = createLoader(modules).load(panel(GOOD));
  assert.equal(out.status, "ready");
  if (out.status !== "ready") return;
  assert.equal(out.definition.title, "My stats");
  assert.equal(out.definition.sdk, PANEL_SDK);
  assert.equal(typeof out.definition.Component, "function");
});

test("the SDK names a panel reads are found in the compiled code, plain or as a namespace", () => {
  assert.deepEqual(sdkNamesUsed(GOOD).sort(), ["definePanel", "useGame"]);
  const star = `const sdk = __importStar(require("@sdk")); sdk.useObservation(); sdk.useGame();`;
  assert.deepEqual(sdkNamesUsed(star).sort(), ["useGame", "useObservation"]);
});

test("a panel written for the first engine's SDK is refused before it runs, naming what it used", () => {
  // Catches: a v1 panel crashing with "useObservation is not a function" deep inside its render.
  let ran = false;
  const v1 = `globalThis.__ran = () => {}; ${GOOD.replace("sdk_1.useGame", "sdk_1.useObservation")}`;
  const out = createLoader({ ...modules, react: { get createElement() { ran = true; return () => null; } } }).load(panel(`require("react").createElement; ${v1}`));
  assert.equal(out.status, "failed");
  assert.match(out.status === "failed" ? out.message : "", /first version of the game/);
  assert.match(out.status === "failed" ? out.message : "", /useObservation/);
  assert.equal(ran, false, "the module never ran");
});

test("a dynamic read of a name the SDK lacks fails with the same reason", () => {
  const dynamic = GOOD.replace("(0, sdk_1.useGame)()", `sdk_1["use" + "Observation"]()`);
  const loader = createLoader(modules);
  const out = loader.load(panel(dynamic));
  assert.equal(out.status, "ready", "the module itself loads");
  assert.throws(() => (out as { definition: { Component: () => unknown } }).definition.Component(), /first version of the game/);
});

test("only react, react/jsx-runtime and @sdk can be required", () => {
  const out = createLoader(modules).load(panel(`require("convex/browser");`));
  assert.equal(out.status, "failed");
  assert.match(out.status === "failed" ? out.message : "", /"convex\/browser" is not available to panels/);
});

test("a module without definePanel says how to write one", () => {
  const out = createLoader(modules).load(panel(`exports.default = 42;`));
  assert.equal(out.status, "failed");
  assert.match(out.status === "failed" ? out.message : "", /export default definePanel/);
});

test("a version is evaluated once; a new version is evaluated again", () => {
  let runs = 0;
  const counting = { ...modules, react: { get createElement() { runs++; return () => null; } } };
  const code = `const React = require("react"); React.createElement; ${GOOD}`;
  const loader = createLoader(counting);
  const a = loader.load(panel(code, 1));
  assert.equal(loader.load(panel(code, 1)), a);
  assert.equal(runs, 1);
  loader.load(panel(code, 2));
  assert.equal(runs, 2);
});

test("a module that throws while loading fails with its message", () => {
  const out = createLoader(modules).load(panel(`throw new TypeError("boom");`));
  assert.deepEqual(out, { status: "failed", message: "TypeError: boom" });
});
