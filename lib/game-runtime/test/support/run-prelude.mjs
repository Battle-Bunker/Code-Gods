// Test harness: evaluate call descriptors against the trusted JS prelude (host Node vm, tests only).
// stdin: {"type": [size, symbols, colours], "grid": "<canonical>", "calls": [[name, [args...]], ...]}
// An argument is a literal, {"$": helper, "a": [args]} (a prelude helper call), or {"$cell": [r, c]}.
// stdout: one entry per call: the call's wire JSON, or "ERR" when the prelude raised its own error.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../grid/prelude.js", import.meta.url), "utf8");
const camel = name => name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const request = JSON.parse(readFileSync(0, "utf8"));
const context = vm.createContext({});
const hooks = vm.runInContext(source, context)(...request.type);
const grid = hooks.grid(request.grid);
const resolve = arg => {
  if (arg === null || typeof arg !== "object" || Array.isArray(arg)) {
    return Array.isArray(arg) ? arg.map(resolve) : arg;
  }
  if (arg.$cell) return grid.cell(...arg.$cell);
  return context[camel(arg.$)](...arg.a.map(resolve));
};
const out = request.calls.map(([name, args]) => {
  try {
    const call = context[camel(name)](...args.map(resolve));
    return hooks.encode([call]).slice(1, -1);
  } catch (error) {
    if (hooks.errorOf(error) === undefined) throw error;
    return "ERR";
  }
});
process.stdout.write(JSON.stringify(out));
