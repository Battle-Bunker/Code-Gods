/**
 * code.run's script runner (convex/v2/codeScript.ts; v1's run_code, A15): main(data, params) in a QuickJS context of its
 * own. What would break: a result that is not main's, a TypeScript `export function main` not found, console output lost,
 * a runaway loop not stopped, a script that reaches anything but its data.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { getQuickJS, type QuickJSWASMModule } from "quickjs-emscripten";
import ts from "typescript";
import { runScript, SCRIPT_LIMITS } from "../../convex/v2/codeScript.ts";

let QuickJS: QuickJSWASMModule;
before(async () => { QuickJS = await getQuickJS(); });
const transpile = (s: string) => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const run = (language: "typescript" | "javascript", source: string, data: unknown, params: unknown = {}, limits = SCRIPT_LIMITS) =>
  runScript(QuickJS, transpile, { language, source, dataJson: JSON.stringify(data), params }, limits);

test("main gets the data and params and its return value is the result; console output is kept", () => {
  const r = run("javascript", "function main(data, params) { console.log('rows', data.length); return data.filter(x => x > params.min); }", [1, 5, 9], { min: 4 });
  assert.deepEqual(r, { status: "ok", resultJson: "[5,9]", output: "rows 3", ms: r.ms, writes: { put: {}, delete: [] } });
});

test("TypeScript, with an exported main", () => {
  const r = run("typescript", "export function main(data: { a: number }[]): number { return data.reduce((t, x) => t + x.a, 0); }", [{ a: 2 }, { a: 3 }]);
  assert.equal(r.status, "ok"); assert.equal((r as any).resultJson, "5");
});

test("an error, a missing main, a runaway loop: an error result, never a throw", () => {
  assert.match((run("javascript", "function main() { throw new Error('boom'); }", null) as any).error, /boom/);
  assert.match((run("javascript", "var x = 1;", null) as any).error, /Define a function main/);
  const loop = run("javascript", "function main() { for (;;) {} }", null, {}, { ...SCRIPT_LIMITS, wallMs: 200 });
  assert.equal(loop.status, "error"); assert.match((loop as any).error, /stopped/);
});

test("a script reaches nothing but its data: no require, no process, no fetch", () => {
  const r = run("javascript", "function main() { return [typeof require, typeof process, typeof fetch, typeof globalThis.Buffer]; }", null);
  assert.equal((r as any).resultJson, JSON.stringify(["undefined", "undefined", "undefined", "undefined"]));
});

test("the store (v1's object store): loaded objects to read, writes buffered and returned after a good run, none after an error", () => {
  const store = { "notes/a": 1, "notes/b": { x: 2 } };
  const ok = runScript(QuickJS, transpile, { language: "javascript", source: "function main() { store.set('notes/c', store.get('notes/a') + 1); store.delete('notes/b'); return store.keys(); }", dataJson: "null", params: {}, store });
  assert.equal(ok.status, "ok");
  assert.deepEqual(JSON.parse((ok as any).resultJson), ["notes/a", "notes/c"]);
  assert.deepEqual((ok as any).writes, { put: { "notes/c": 2 }, delete: ["notes/b"] });
  const bad = runScript(QuickJS, transpile, { language: "javascript", source: "function main() { store.set('k', 1); throw new Error('no'); }", dataJson: "null", params: {}, store: {} });
  assert.equal(bad.status, "error"); assert.equal((bad as any).writes, undefined, "an error writes nothing");
  const none = run("javascript", "function main() { return store.keys(); }", null);
  assert.equal((none as any).resultJson, "[]", "no store loaded: an empty one");
});
