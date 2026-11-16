/**
 * One code run's script (v1's run_code, A15): `main(data, params)` in a fresh QuickJS context of its own, never an agent
 * sandbox's (lib/v2-sandbox speaks only the act protocol). The dataset is a global the script reads; it returns JSON.
 * A script reads only: it has no host, no network, no clock beyond Date, and cannot act in a game. Bounded by a deadline
 * (interrupt), a memory cap and a stack cap; console output is kept (clipped). TypeScript is transpiled first.
 *
 * Pure apart from the QuickJS module it is given (codeRun.ts passes the engine's; the unit test its own).
 */
import type { QuickJSWASMModule } from "quickjs-emscripten";

export interface ScriptLimits { wallMs: number; memoryBytes: number; stackBytes: number; sourceBytes: number; resultChars: number; outputChars: number }
export const SCRIPT_LIMITS: Readonly<ScriptLimits> = { wallMs: 10_000, memoryBytes: 256 * 1024 * 1024, stackBytes: 1024 * 1024, sourceBytes: 64 * 1024, resultChars: 256 * 1024, outputChars: 16 * 1024 };

/** A run's store writes (v1's object store): keys set to JSON values, keys deleted. Untrusted: the caller checks them. */
export type StoreWrites = { put: Record<string, unknown>; delete: string[] };
export type ScriptOutcome =
  | { status: "ok"; resultJson: string; output: string; ms: number; writes: StoreWrites }
  | { status: "error"; error: string; output: string; ms: number };

type Transpile = (source: string) => string;

/**
 * Runs `main` from `source` on `dataJson` (the dataset's JSON text) and `params`. TypeScript goes through `transpile`
 * (CommonJS: an `export function main` is found on `exports`); JavaScript runs as written.
 */
export function runScript(QuickJS: QuickJSWASMModule, transpile: Transpile, a: { language: "typescript" | "javascript"; source: string; dataJson: string; params: unknown; store?: Record<string, unknown> }, limits: Readonly<ScriptLimits> = SCRIPT_LIMITS): ScriptOutcome {
  const started = performance.now(), out: string[] = [];
  let outChars = 0;
  const ms = () => Math.round(performance.now() - started);
  const output = () => out.join("\n");
  if (Buffer.byteLength(a.source, "utf8") > limits.sourceBytes) return { status: "error", error: `The source is over ${limits.sourceBytes / 1024} KiB.`, output: "", ms: 0 };
  let js: string;
  try { js = a.language === "typescript" ? transpile(a.source) : a.source; }
  catch (e) { return { status: "error", error: `It does not compile: ${String((e as Error).message ?? e)}`, output: "", ms: ms() }; }
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(limits.stackBytes);
  const deadline = Date.now() + limits.wallMs;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  try {
    const log = vm.newFunction("log", (...args) => {
      const line = args.map(h => { const v = vm.dump(h); return typeof v === "string" ? v : JSON.stringify(v); }).join(" ");
      if (outChars < limits.outputChars) { out.push(line.slice(0, limits.outputChars - outChars)); outChars += line.length + 1; }
    });
    const console = vm.newObject();
    for (const name of ["log", "info", "warn", "error"]) vm.setProp(console, name, log);
    vm.setProp(vm.global, "console", console);
    console.dispose(); log.dispose();
    const data = vm.newString(a.dataJson), params = vm.newString(JSON.stringify(a.params ?? {}));
    const storeText = vm.newString(JSON.stringify(a.store ?? {}));
    vm.setProp(vm.global, "__DATA__", data); vm.setProp(vm.global, "__PARAMS__", params); vm.setProp(vm.global, "__STORE__", storeText);
    data.dispose(); params.dispose(); storeText.dispose();
    // The store: the loaded objects to read; set and delete are buffered and returned with the result.
    const prelude = `var store = (function () {
  var values = JSON.parse(__STORE__), put = {}, del = {};
  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  return {
    get: function (k) { return copy(values[k]); },
    set: function (k, v) { if (typeof k !== "string") throw new Error("store keys are strings"); var t = JSON.stringify(v); if (t === undefined) throw new Error("store values are JSON"); values[k] = JSON.parse(t); put[k] = values[k]; delete del[k]; },
    delete: function (k) { delete values[k]; delete put[k]; del[k] = true; },
    keys: function () { return Object.keys(values).sort(); },
    __writes: function () { return { put: put, delete: Object.keys(del) }; },
  };
})();\n`;
    const program = `var exports = {}; var module = { exports };\n${prelude}${js}\n;(function () {
  var f = typeof main === "function" ? main : (module.exports.main || exports.main);
  if (typeof f !== "function") throw new Error("Define a function main(data, params) and return what you want to keep.");
  var r = f(JSON.parse(__DATA__), JSON.parse(__PARAMS__));
  return JSON.stringify({ result: JSON.stringify(r === undefined ? null : r), writes: store.__writes() });
})()`;
    const res = vm.evalCode(program, "script.js");
    if (res.error) {
      const err = vm.dump(res.error) as { message?: string; name?: string } | string;
      res.error.dispose();
      const message = typeof err === "string" ? err : `${err?.name ?? "Error"}: ${err?.message ?? JSON.stringify(err)}`;
      const timedOut = Date.now() > deadline || /interrupted/i.test(message);
      return { status: "error", error: timedOut ? `It ran past ${limits.wallMs / 1000} s and was stopped.` : message, output: output(), ms: ms() };
    }
    const envelope = vm.dump(res.value) as string | undefined;
    res.value.dispose();
    let parsed: { result?: unknown; writes?: { put?: unknown; delete?: unknown } } | null = null;
    try { parsed = typeof envelope === "string" ? JSON.parse(envelope) : null; } catch { parsed = null; }
    const text = parsed?.result;
    if (typeof text !== "string") return { status: "error", error: "main returned something that is not JSON data.", output: output(), ms: ms() };
    if (text.length > limits.resultChars) return { status: "error", error: `The result is over ${limits.resultChars / 1024} KiB of JSON: return less (a summary).`, output: output(), ms: ms() };
    // The guest could have tampered with its own store object: keep only well-formed writes.
    const w = parsed?.writes, put = w?.put && typeof w.put === "object" && !Array.isArray(w.put) ? w.put as Record<string, unknown> : {};
    const del = Array.isArray(w?.delete) ? (w.delete as unknown[]).filter((k): k is string => typeof k === "string") : [];
    return { status: "ok", resultJson: text, output: output(), ms: ms(), writes: { put, delete: del } };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}
