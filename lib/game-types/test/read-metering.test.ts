/**
 * Read metering (docs/energy-model.md §3): the metered view an agent receives from `__agent_view(wire)`, in the Python and
 * the JS prelude of every object type. Python runs with the system python3 (as test/parity.py does); JS in a fresh vm realm.
 * Every case runs the same reads in both languages and checks the bits against hand-derived values.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { ENCODE_CALLS_JS, GRID, OBJECT_TYPES, sha256, withCommitClause, type Instantiation } from "../src/index.ts";

const python3 = spawnSync("python3", ["--version"]).status === 0;
const skipPy = python3 ? false : "python3 is not installed";

const g4 = GRID.instantiate({ size: 4, symbols: "base10", colours: "rgb" });           // S = 10, V = 10, C = 3
const W4 = "1G,9B,1G,1B/8R,1R,7R,6R/6R,7R,6R,6R/6R,2G,3B,6R";
const cards = GRID.instantiate({ size: 3, symbols: "cards", colours: "rainbow6" });    // S = 52, V = 13, C = 6, suits, faces
const WC = "KHV,ASR,TDO/2CY,QSG,JHB/9DV,8CR,AHG";
const lg = Math.log2;
const near = (a: number[], b: number[], msg?: string) => {
  assert.equal(a.length, b.length, msg);
  a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-9, `${msg ?? ""} step ${i}: ${x} vs ${b[i]} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`));
};

const preludeOf = (inst: Instantiation) => OBJECT_TYPES.find(t => t.id === inst.objectType)!.prelude(inst);

function runPy(inst: Instantiation, body: string): any {
  const src = `import json\n${preludeOf(inst).python}\n${body}\n`;
  const r = spawnSync("python3", ["-I", "-"], { input: src, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`python failed:\n${r.stderr}`);
  return JSON.parse(r.stdout.trim().split("\n").pop()!);
}
function runJs(inst: Instantiation, body: string): any {
  return JSON.parse(runInNewContext(`${preludeOf(inst).js}\n(() => {\n${body}\n})()`, {}));
}

/** Steps are [python statement, js statement] pairs; the meter is read after each. `v` is the view. */
type Step = readonly [py: string, js: string];
function trace(inst: Instantiation, wire: string | number, steps: readonly Step[]) {
  const w = JSON.stringify(wire);
  const js = runJs(inst, `const v = __agent_view(${w}); const r = [];\n${steps.map(s => `${s[1]};\nr.push(__read_bits());`).join("\n")}\nreturn JSON.stringify(r);`);
  const py = python3 ? runPy(inst, `v = __agent_view(${w})\nr = []\n${steps.map(s => `${s[0]}\nr.append(__read_bits())`).join("\n")}\nprint(json.dumps(r))`) : js;
  near(py, js, "Python and JS read the same bits");
  return js as number[];
}
/** The same reads in a single statement list for a language-neutral expression (works in both). */
const both = (stmt: string): Step => [stmt, stmt];

// ------------------------------------------------------------------------------------------------
// Grid
// ------------------------------------------------------------------------------------------------

test("grid: each accessor charges its bits on the first read in an act, repeats are free", { skip: skipPy }, () => {
  const bits = trace(g4, W4, [
    ["v.cell(0, 0).colour", "v.cell(0, 0).colour"], ["v.cell(0, 0).colour", "v.cell(0, 0).colour"],
    ["v.cell(1, 1).symbol", "v.cell(1, 1).symbol"], ["v.cell(1, 1).symbol", "v.cell(1, 1).symbol"],
    ["v.cell(2, 2).value", "v.cell(2, 2).value"],
  ]);
  near(bits, [lg(3), lg(3), lg(3) + lg(10), lg(3) + lg(10), lg(3) + 2 * lg(10)]);
});

test("grid: symbol, value, suit and is_picture of one cell share log2 S; colour does not", { skip: skipPy }, () => {
  const at = ["v.cell(0, 0)", "v.cell(0, 0)"];
  const bits = trace(cards, WC, [
    [`${at[0]}.is_picture`, `${at[1]}.isPicture`], [`${at[0]}.suit`, `${at[1]}.suit`], [`${at[0]}.value`, `${at[1]}.value`],   // 1 + 2 + log2 13 > log2 52
    [`${at[0]}.symbol`, `${at[1]}.symbol`], [`${at[0]}.colour`, `${at[1]}.colour`],
  ]);
  near(bits, [1, 3, lg(52), lg(52), lg(52) + lg(6)]);
  // value then symbol is log2 S in all, not log2 V + log2 S
  near(trace(cards, WC, [both("v.cell(1, 1).value"), ["v.cell(1, 1).symbol", "v.cell(1, 1).symbol"]]), [lg(13), lg(52)]);
  // a different cell has its own cap
  near(trace(cards, WC, [both("v.cell(0, 0).symbol"), ["v.cell(0, 1).symbol", "v.cell(0, 1).symbol"]]), [lg(52), 2 * lg(52)]);
});

test("grid, mono: colour reads 0 bits, the palette has one entry, and a full look is 16 · log2 10", { skip: skipPy }, () => {
  const mono = GRID.instantiate({ size: 4, symbols: "base10", colours: "mono" });
  const wire = "1P,9P,1P,1P/8P,1P,7P,6P/6P,7P,6P,6P/6P,2P,3P,6P";
  near(trace(mono, wire, [
    both("v.cell(0, 0).colour"), ["c = [x.colour for x in v.cells]", "const c = v.cells.map(x => x.colour)"],
    both("v.cell(0, 0).symbol"), ["s = [x.value for x in v.cells]", "const s = v.cells.map(x => x.value)"],
  ]), [0, 0, lg(10), 16 * lg(10)]);
  assert.deepEqual(runJs(mono, `const v = __agent_view(${JSON.stringify(wire)}); return JSON.stringify([v.palette, v.cell(1, 2).colour, String(v)]);`),
    [["plain"], "plain", "1 9 1 1\n8 1 7 6\n6 7 6 6\n6 2 3 6"]);
  if (python3) assert.deepEqual(runPy(mono, `v = __agent_view(${JSON.stringify(wire)})\nprint(json.dumps([v.palette, v.cell(1, 2).colour, repr(v)]))`),
    [["plain"], "plain", "1 9 1 1\n8 1 7 6\n6 7 6 6\n6 2 3 6"]);
});

test("grid: positions, neighbours and shapes are free", { skip: skipPy }, () => {
  const bits = trace(g4, W4, [
    ["[c.row + c.col for c in v.cells]", "v.cells.map((c) => c.row + c.col)"],
    ["[c.on_edge for c in v.cells]", "v.cells.map((c) => c.onEdge)"],
    ["[len(c.neighbours) + len(c.surrounding) for c in v.cells]", "v.cells.map((c) => c.neighbours.length + c.surrounding.length)"],
    ["[v.size, v.palette, v.rows, v.columns, v.diagonals, v.edge_cells]", "[v.size, v.palette, v.rows, v.columns, v.diagonals, v.edgeCells]"],
    ["v.quarter_turn(v.cell(0, 1))", "v.quarterTurn(v.cell(0, 1))"],
    ["v.cell(0, 0).left, v.cell(0, 0).up_left, v.cell(1, 1).down_right", "[v.cell(0, 0).left, v.cell(0, 0).upLeft, v.cell(1, 1).downRight]"],
  ]);
  near(bits, [0, 0, 0, 0, 0, 0]);
});

test("grid: repr reads every cell's two layers (78.5 bits on First steps)", { skip: skipPy }, () => {
  const bits = trace(g4, W4, [["repr(v)", "String(v)"], ["repr(v.cell(0, 0))", "String(v.cell(0, 0))"]]);
  near(bits, [16 * (lg(10) + lg(3)), 16 * (lg(10) + lg(3))]);
  assert.ok(Math.abs(bits[0] - 78.5) < 0.05);
  // one cell's repr: symbol and colour of that cell only
  near(trace(g4, W4, [["repr(v.cell(2, 3))", "String(v.cell(2, 3))"]]), [lg(10) + lg(3)]);
});

test("grid: reachable and regions charge what their callbacks read", { skip: skipPy }, () => {
  // reads nothing: free
  near(trace(g4, W4, [
    ["v.reachable(v.cell(0, 0), lambda c: True)", "v.reachable(v.cell(0, 0), (c) => true)"],
    ["v.regions(lambda a, b: a.row == b.row)", "v.regions((a, b) => a.row === b.row)"],
  ]), [0, 0]);
  // reachable over red from (0,0): (0,0) is green so nothing is walked; only the start's colour is read
  const through = ["lambda c: c.colour == 'red'", "(c) => c.colour === 'red'"];
  near(trace(g4, W4, [[`v.reachable(v.cell(1, 0), ${through[0]})`, `v.reachable(v.cell(1, 0), ${through[1]})`]]),
    [lg(3) * readByReach("red", 1, 0)]);
  // regions by colour and by value read every cell
  near(trace(g4, W4, [["v.regions(lambda a, b: a.colour == b.colour)", "v.regions((a, b) => a.colour === b.colour)"]]), [16 * lg(3)]);
  near(trace(g4, W4, [["v.regions(lambda a, b: a.value == b.value)", "v.regions((a, b) => a.value === b.value)"]]), [16 * lg(10)]);
});

/** Cells whose colour reachable(start, colour == c) reads: the start and every neighbour of each cell it walks onto. */
function readByReach(colour: string, r0: number, c0: number): number {
  const names: Record<string, string> = { R: "red", G: "green", B: "blue" };
  const grid = W4.split("/").map(l => l.split(",").map(t => names[t.slice(-1)]));
  const n = grid.length, key = (r: number, c: number) => r * n + c, read = new Set<number>(), seen = new Set<number>();
  const through = (r: number, c: number) => { read.add(key(r, c)); return grid[r][c] === colour; };
  const todo: [number, number][] = through(r0, c0) ? [[r0, c0]] : [];
  todo.forEach(([r, c]) => seen.add(key(r, c)));
  while (todo.length) {
    const [r, c] = todo.pop()!;
    for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n || seen.has(key(rr, cc))) continue;
      if (through(rr, cc)) { seen.add(key(rr, cc)); todo.push([rr, cc]); }
    }
  }
  return read.size;
}

test("grid: reachable walks the red region and is charged for the cells it looked at", { skip: skipPy }, () => {
  // (1,1) is red; the walk reads it and the neighbours of every red cell it enters
  const k = readByReach("red", 1, 1);
  assert.ok(k > 4, "the walk spreads");
  near(trace(g4, W4, [["v.reachable(v.cell(1, 1), lambda c: c.colour == 'red')", "v.reachable(v.cell(1, 1), (c) => c.colour === 'red')"]]), [k * lg(3)]);
});

test("grid: __agent_view starts a fresh meter, and the cells are Cells", { skip: skipPy }, () => {
  const w = JSON.stringify(W4);
  assert.deepEqual(runPy(g4, `a = __agent_view(${w})\na.cell(0, 0).colour\nx = __read_bits()\nb = __agent_view(${w})\nprint(json.dumps([x > 0, __read_bits(), isinstance(b.cell(0, 0), Cell), isinstance(b, Grid), b.reachable(b.cell(0, 0), lambda c: False) == [], not hasattr(b.cell(0, 0), "__dict__")]))`),
    [true, 0, true, true, true, true]);
  assert.deepEqual(JSON.parse(runInNewContext(`${preludeOf(g4).js}
    const a = __agent_view(${w}); a.cell(0, 0).colour; const x = __read_bits(); const b = __agent_view(${w});
    JSON.stringify([x > 0, __read_bits(), b.cell(0, 0) instanceof Cell, Object.isFrozen(b.cell(0, 0)), b.reachable(b.cell(0, 0), (c) => false).length === 0,
      Object.keys(b.cell(0, 0)).includes("colour")])`, {})), [true, 0, true, true, true, true]);
});

test("grid (JS): redefining builtins after the view exists cannot make a read free", () => {
  const out = runInNewContext(`${preludeOf(g4).js}
    const v = __agent_view(${JSON.stringify(W4)}), read = __read_bits;
    Math.min = Math.max = () => 0; Number.isInteger = () => true;
    Array.prototype.push = Array.prototype.forEach = Array.prototype.includes = Array.prototype.indexOf = () => 0;
    Set.prototype.add = Set.prototype.has = Map.prototype.get = Map.prototype.set = () => false;
    Object.defineProperty = Object.freeze = () => 0; Float64Array.prototype.fill = () => 0;
    const c = v.cell(1, 1); c.colour; c.symbol; c.value;
    JSON.stringify(read())`, {});
  near([JSON.parse(out)], [lg(3) + lg(10)]);
});

test("grid: hidden board data is not reachable through the cell or the grid (JS)", () => {
  const out = runInNewContext(`${preludeOf(g4).js}
    const v = __agent_view(${JSON.stringify(W4)}); const c = v.cell(0, 0);
    JSON.stringify([Object.getOwnPropertyNames(c).filter((k) => !["row","col","left","right","up","down","upLeft","upRight","downLeft","downRight","colour","symbol","value"].includes(k)),
      Object.getOwnPropertySymbols(c).length, Reflect.ownKeys(v)])`, {});
  assert.deepEqual(JSON.parse(out), [[], 0, ["size", "palette"]]);
});

// ------------------------------------------------------------------------------------------------
// types, docs, vocabulary
// ------------------------------------------------------------------------------------------------

function diagnostics(dts: string, source: string): string[] {
  const files: Record<string, string> = { "/prelude.d.ts": dts, "/agent.ts": source };
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, lib: ["lib.es2022.d.ts"], types: [] };
  const host = ts.createCompilerHost(options), read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, lang, ...rest) => name in files ? ts.createSourceFile(name, files[name], lang) : read(name, lang, ...rest);
  host.fileExists = name => name in files || ts.sys.fileExists(name);
  host.readFile = name => files[name] ?? ts.sys.readFile(name);
  return ts.getPreEmitDiagnostics(ts.createProgram(Object.keys(files), options, host)).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}
const agentParam = "type View = ReturnType<typeof __agent_view>;\nconst bits: number = __read_bits();\n";

test("dts: the agent's parameter type is ReturnType<typeof __agent_view>", () => {
  assert.deepEqual(diagnostics(GRID.prelude(cards).dts, `${agentParam}function agent(g: View) { const c = g.cell(0, 0); return [c.colour, c.symbol, c.value, c.suit, c.isPicture, g.cells.length]; }`), []);
  assert.ok(diagnostics(GRID.prelude(g4).dts, `${agentParam}function agent(g: View) { return g.cell(0, 0).suit; }`).length > 0, "no suit on base10");
});

test("helper docs state the read costs", () => {
  const kid = (inst: Instantiation, name: string) => preludeOf(inst).helpers.find(h => h.name.python === name)!.kid;
  assert.match(kid(g4, "cell.colour"), /1\.58 bits/);
  assert.match(kid(g4, "cell.symbol"), /3\.32 bits/);
  assert.match(kid(cards, "cell.suit"), /2 bits/);
  assert.match(kid(cards, "cell.is_picture"), /1 bit/);
  assert.match(kid(cards, "cell.value"), /3\.7 bits.*5\.7 bits per cell/);
});

test("pricing vocabulary knows the view's attributes", () => {
  for (const [inst, names] of [[g4, ["colour", "symbol", "value"]]] as const)
    for (const lang of ["python", "typescript"] as const)
      for (const n of names) assert.ok(preludeOf(inst).pricing[lang].attrs.includes(n), `${inst.key} ${lang} attrs has ${n}`);
  assert.ok(preludeOf(cards).pricing.python.attrs.includes("is_picture") && preludeOf(cards).pricing.typescript.attrs.includes("isPicture"));
});

// ------------------------------------------------------------------------------------------------
// the utility cards' part of the prelude does not change
// ------------------------------------------------------------------------------------------------

test("utility hash: the JS text before the call encoder is unchanged for every representative instantiation", () => {
  // Snapshot of sha256(js.slice(0, js.indexOf(ENCODE_CALLS_JS))) taken from develop before read metering existed
  // (lib/game-utilities calibration tables are keyed by it; test/pre-encoder-hashes.json).
  const expected: Record<string, string> = JSON.parse(readFileSync(new URL("./pre-encoder-hashes.json", import.meta.url), "utf8"));
  let checked = 0;
  for (const t of OBJECT_TYPES) for (const a of t.representatives()) {
    const inst = t.instantiate(a), js = t.prelude(inst).js, at = js.indexOf(ENCODE_CALLS_JS);
    assert.ok(at > 0, inst.key);
    assert.equal(sha256(js.slice(0, at)), expected[inst.key], `${inst.key}: the utility part of the prelude changed`);
    assert.ok(js.indexOf("function __agent_view") > at, `${inst.key}: the agent view comes after the call encoder`);
    assert.ok(js.indexOf("function __read_bits") > at);
    assert.ok(!js.slice(0, at).includes("__agent_view"));
    checked++;
  }
  assert.equal(checked, Object.keys(expected).length);
});

test("the commit clause still follows the view", () => {
  const p = withCommitClause(GRID.prelude(g4));
  assert.ok(p.js.indexOf("function __agent_view") < p.js.indexOf("function onlyIfBetter"));
});

