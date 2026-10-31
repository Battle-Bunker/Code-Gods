/**
 * The panel frame's module loader (src/frame/loader.ts): evaluates a stored panel's compiled CommonJS with a
 * `require` that hands out the frame's own React and SDK instances, and nothing else.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createLoader, PanelImportError } from "../src/frame/loader.ts";

const react = { name: "react instance" };
const jsx = { name: "jsx-runtime instance" };
const sdk = { name: "sdk instance", definePanel: (d: unknown) => d };
const modules = { react, "react/jsx-runtime": jsx, "@sdk": sdk };
const panel = (title: string) => `const sdk_1 = require("@sdk");\nexports.default = (0, sdk_1.definePanel)({ title: ${JSON.stringify(title)}, Component: () => null });\n`;

test("require hands the panel the host's own module instances", () => {
  const loader = createLoader(modules);
  const loaded = loader.load("probe", 1, `exports.react = require("react"); exports.jsx = require("react/jsx-runtime"); exports.sdk = require("@sdk");\n${panel("p")}`);
  assert.equal(loaded.status, "ready");
  if (loaded.status !== "ready") return;
  const exports = loaded.module as Record<string, unknown>;
  assert.equal(exports.react, react);
  assert.equal(exports.jsx, jsx);
  assert.equal(exports.sdk, sdk);
  assert.equal(loaded.definition.title, "p");
});

test("an unknown module throws a named PanelImportError and the panel fails to load", () => {
  const loader = createLoader(modules);
  const loaded = loader.load("fs-user", 1, `const fs = require("fs");\n${panel("x")}`);
  assert.equal(loaded.status, "failed");
  if (loaded.status !== "failed") return;
  assert.match(loaded.message, /PanelImportError/);
  assert.match(loaded.message, /"fs"/);
  assert.match(loaded.message, /@sdk/);
  assert.throws(() => loader.require("child_process"), (e: unknown) => e instanceof PanelImportError && e.name === "PanelImportError");
});

test("the same (slug, version) gives the same module object; a new version a new one", () => {
  const loader = createLoader(modules);
  const a = loader.load("same", 3, panel("v3"));
  const b = loader.load("same", 3, panel("v3"));
  const c = loader.load("same", 4, panel("v4"));
  assert.ok(a.status === "ready" && b.status === "ready" && c.status === "ready");
  assert.equal(a.module, b.module);
  assert.equal(a, b, "the status object itself is stable, so React does not remount");
  assert.notEqual(a.module, c.module);
  assert.equal(c.definition.title, "v4");
});

test("a top-level throw gives a failed status with its message", () => {
  const loaded = createLoader(modules).load("boom", 1, `throw new Error("top-level kaboom");`);
  assert.equal(loaded.status, "failed");
  assert.match(loaded.status === "failed" ? loaded.message : "", /top-level kaboom/);
});

test("a module without a panel says what to export; a bare component is accepted", () => {
  const loader = createLoader(modules);
  const none = loader.load("none", 1, `exports.x = 1;`);
  assert.equal(none.status, "failed");
  assert.match(none.status === "failed" ? none.message : "", /export default definePanel/);
  const bare = loader.load("bare", 1, `exports.default = function Bare() { return null; };`);
  assert.equal(bare.status, "ready");
  assert.equal(bare.status === "ready" ? bare.definition.title : "", "bare");
});
