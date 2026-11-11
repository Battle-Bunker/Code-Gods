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
import { ENCODE_CALLS_JS, GRID, INT, OBJECT_TYPES, STRING, sha256, withCommitClause, type Instantiation } from "../src/index.ts";

const python3 = spawnSync("python3", ["--version"]).status === 0;
const skipPy = python3 ? false : "python3 is not installed";

const g4 = GRID.instantiate({ size: 4, symbols: "base10", colours: "rgb" });           // S = 10, V = 10, C = 3
const W4 = "1G,9B,1G,1B/8R,1R,7R,6R/6R,7R,6R,6R/6R,2G,3B,6R";
const cards = GRID.instantiate({ size: 3, symbols: "cards", colours: "rainbow6" });    // S = 52, V = 13, C = 6, suits, faces
const WC = "KHV,ASR,TDO/2CY,QSG,JHB/9DV,8CR,AHG";
const int32 = INT.instantiate({}), int4 = INT.instantiate({ min: 0, max: 9999 });
const str16 = STRING.instantiate({ maxLength: 16 });
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
// Int
// ------------------------------------------------------------------------------------------------

test("int: value, digit and negative charge their bits, capped at log2 W per act", { skip: skipPy }, () => {
  assert.deepEqual(trace(int32, 5000, [["v.value", "v.value"]]), [32]);
  near(trace(int32, -5000, [
    ["v.digit(0)", "v.digit(0)"], ["v.digit(0)", "v.digit(0)"], ["v.digit(3)", "v.digit(3)"], ["v.negative", "v.negative"], ["v.value", "v.value"], ["v.digit(7)", "v.digit(7)"],
  ]), [lg(10), lg(10), 2 * lg(10), 2 * lg(10) + 1, 32, 32]);
  // ten digits and the sign add up to more than log2 W; the act never pays past it
  assert.deepEqual(trace(int32, 1234567890, [
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((p): Step => [`v.digit(${p})`, `v.digit(${p})`]), ["v.negative", "v.negative"],
  ]).slice(-2), [32, 32]);
  // W = 10000 on 0..9999: 13.29 bits
  near(trace(int4, 1234, [["v.value", "v.value"], ["v.digit(2)", "v.digit(2)"]]), [lg(10000), lg(10000)]);
});

test("int: digits, sign and the number itself read what the view says", { skip: skipPy }, () => {
  const values = runJs(int32, `const n = __agent_view(-305); return JSON.stringify([n.value, n.digit(0), n.digit(1), n.digit(2), n.digit(3), n.negative]);`);
  assert.deepEqual(values, [-305, 5, 0, 3, 0, true]);
  assert.deepEqual(runPy(int32, `n = __agent_view(-305)\nprint(json.dumps([n.value, n.digit(0), n.digit(1), n.digit(2), n.digit(3), n.negative]))`), values);
  assert.deepEqual(runJs(int32, `const n = __agent_view(7); return JSON.stringify([n + 1, n * 2, \`\${n}\`, String(n), n > 5, JSON.stringify([n.value])]);`), [8, 14, "7", "7", true, "[7]"]);
});

test("int (Python): used as a number it reads the whole number, once", { skip: skipPy }, () => {
  const ops = ["n + 1", "1 + n", "n - 1", "5 - n", "n * 3", "3 * n", "n // 2", "100 // n", "n % 2", "100 % n", "n / 4", "10 / n", "divmod(n, 3)", "divmod(100, n)",
    "n ** 2", "2 ** n", "pow(n, 2, 7)", "n << 1", "1 << n", "n >> 1", "n & 6", "n | 1", "n ^ 3", "-n", "+n", "abs(n)", "~n", "n == 7", "7 == n", "n != 7", "n < 9", "n <= 9",
    "n > 9", "n >= 9", "bool(n)", "hash(n)", "int(n)", "float(n)", "round(n)", "round(n, -1)", "range(n)[0]", "[0] * n", "list(range(n))", "str(n)", "repr(n)", "'%d' % n", "f'{n}'", "format(n, '04d')",
    "n + n", "n == n", "[10, 20, 30, 40, 50, 60, 70, 80][n]", "int.bit_length(int(n))", "digits(n)", "max(n, 3)", "sum([n, n])"];
  const res = runPy(int4, `out = {}\n${ops.map(o => `n = __agent_view(7)\ntry:\n    x = ${o}\n    ok = True\nexcept Exception as e:\n    ok = repr(e)\nout[${JSON.stringify(o)}] = [ok, __read_bits()]`).join("\n")}\nprint(json.dumps(out))`);
  for (const o of ops) assert.deepEqual([o, res[o][0], +res[o][1].toFixed(9)], [o, true, +lg(10000).toFixed(9)], `${o} charges the full read`);
  // and behaves as the int
  const vals = runPy(int4, `n = __agent_view(7)\nprint(json.dumps([n + 1, 3 * n, n % 4, n > 5, n == 7, str(n), f"{n:03d}", divmod(n, 2), pow(n, 2), int(n), float(n), range(n)[-1], hash(n) == hash(7), bool(n), abs(n), round(n / 2)]))`);
  assert.deepEqual(vals, [8, 21, 3, true, true, "7", "007", [3, 1], 49, 7, 7, 6, true, true, 7, 4]);
  // looking at digit(0) first, then using it as a number: still log2 W in total
  const mixed = runPy(int4, `n = __agent_view(1234)\nn.digit(0)\na = __read_bits()\nn + 1\nprint(json.dumps([a, __read_bits()]))`);
  near(mixed, [lg(10), lg(10000)]);
});

// ------------------------------------------------------------------------------------------------
// string
// ------------------------------------------------------------------------------------------------

test("string: length, char and text charge their bits; the total never passes the whole text", { skip: skipPy }, () => {
  const Lb = lg(17), Ab = 7;
  near(trace(str16, "hello", [
    ["v.length", "v.length"], ["v.length", "v.length"], ["v.char(1)", "v.char(1)"], ["v.char(1)", "v.char(1)"], ["v.char(4)", "v.char(4)"], ["v.text", "v.text"], ["v.char(0)", "v.char(0)"],
  ]), [Lb, Lb, Lb + Ab, Lb + Ab, Lb + 2 * Ab, Lb + 5 * Ab, Lb + 5 * Ab]);
  near(trace(str16, "hello", [["v.text", "v.text"]]), [Lb + 5 * Ab]);
  near(trace(str16, "", [["v.text", "v.text"]]), [Lb]);
  near(trace(str16, "abc", [["v.char(0)", "v.char(0)"], ["v.char(1)", "v.char(1)"], ["v.char(2)", "v.char(2)"], ["v.length", "v.length"]]), [Ab, 2 * Ab, 3 * Ab, 3 * Ab + Lb]);
  near(trace(STRING.instantiate({ maxLength: 0 }), "", [["v.length", "v.length"], ["v.text", "v.text"]]), [0, 0]);
  assert.throws(() => runJs(str16, `__agent_view("abc").char(3)`), /no character at place 3/);
  assert.throws(() => runJs(str16, `__agent_view("é")`), /not text/);
});

test("string (Python): len, indexing, slices, iteration, in, str and comparisons charge as they read", { skip: skipPy }, () => {
  const Lb = lg(17), Ab = 7;
  const bitsOf = (expr: string) => runPy(str16, `s = __agent_view("hello")\nx = ${expr}\nprint(json.dumps([x if isinstance(x, (int, str, bool)) else repr(x), __read_bits()]))`);
  const cases: [string, unknown, number][] = [
    ["len(s)", 5, Lb], ["s[1]", "e", Lb * 0 + Ab], ["s[-1]", "o", Lb + Ab], ["s[1:3]", "el", Lb + 2 * Ab], ["s[::-1]", "olleh", Lb + 5 * Ab],
    ["''.join(c for c in s)", "hello", Lb + 5 * Ab], ["'l' in s", true, Lb + 5 * Ab], ["str(s)", "hello", Lb + 5 * Ab], ["s == 'hello'", true, Lb + 5 * Ab],
    ["s < 'help'", true, Lb + 5 * Ab], ["'say ' + s", "say hello", Lb + 5 * Ab], ["s.upper()", "HELLO", Lb + 5 * Ab], ["s.text", "hello", Lb + 5 * Ab],
    ["f'{s}'", "hello", Lb + 5 * Ab], ["bool(s)", true, Lb], ["s.length", 5, Lb], ["s.char(2)", "l", Ab],
  ];
  for (const [expr, value, bits] of cases) {
    const [v, b] = bitsOf(expr);
    assert.deepEqual(v, value, expr);
    assert.ok(Math.abs(b - bits) < 1e-9, `${expr}: ${b} bits, expected ${bits}`);
  }
  assert.throws(() => bitsOf("s[9]"), /IndexError/);
  assert.deepEqual(runPy(str16, `s = __agent_view("hello")\nit = iter(s)\nnext(it)\nprint(json.dumps([__read_bits()]))`).map((b: number) => +b.toFixed(6)), [+(Lb + Ab).toFixed(6)]);
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
  assert.deepEqual(diagnostics(INT.prelude(int32).dts, `${agentParam}function agent(n: View) { return [n.value + 1, n.digit(2), n.negative, digits(n)]; }`), []);
  assert.deepEqual(diagnostics(STRING.prelude(str16).dts, `${agentParam}function agent(s: View) { return [s.length, s.char(0), s.text.toUpperCase()]; }`), []);
  assert.ok(diagnostics(INT.prelude(int32).dts, `${agentParam}function agent(n: View) { return n + 1; }`).length > 0, "a bare Num is not a number in TS");
  assert.ok(diagnostics(STRING.prelude(str16).dts, `${agentParam}function agent(s: View) { return s.charAt(0); }`).length > 0);
  assert.ok(diagnostics(GRID.prelude(g4).dts, `${agentParam}function agent(g: View) { return g.cell(0, 0).suit; }`).length > 0, "no suit on base10");
});

test("helper docs state the read costs", () => {
  const kid = (inst: Instantiation, name: string) => preludeOf(inst).helpers.find(h => h.name.python === name)!.kid;
  assert.match(kid(int32, "n.value"), /Reads the whole number: 32 bits/);
  assert.match(kid(int32, "n.digit"), /3\.32 bits/);
  assert.match(kid(int32, "n.negative"), /1 bit/);
  assert.match(kid(int4, "n.value"), /13\.29 bits/);
  assert.match(kid(str16, "s.char"), /7 bits/);
  assert.match(kid(str16, "s.length"), /4\.09 bits/);
  assert.match(kid(g4, "cell.colour"), /1\.58 bits/);
  assert.match(kid(g4, "cell.symbol"), /3\.32 bits/);
  assert.match(kid(cards, "cell.suit"), /2 bits/);
  assert.match(kid(cards, "cell.is_picture"), /1 bit/);
  assert.match(kid(cards, "cell.value"), /3\.7 bits.*5\.7 bits per cell/);
  assert.equal(preludeOf(int32).helpers.find(h => h.name.python === "n.digit")!.name.typescript, "n.digit");
});

test("pricing vocabulary knows the view's attributes", () => {
  for (const [inst, names] of [[int32, ["value", "digit", "negative"]], [str16, ["text", "char", "length"]], [g4, ["colour", "symbol", "value"]]] as const)
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
  const p = withCommitClause(INT.prelude(int32));
  assert.ok(p.js.indexOf("function __agent_view") < p.js.indexOf("function onlyIfBetter"));
});

test("mutator constructors take the metered views themselves, reading them in full", { skip: skipPy }, () => {
  // Python: add(max(n, 0)) passes the Num itself; write(0, s) passes the Text.
  const num = trace(int32, 12345, [["c = add(max(v, 0))", "const c = add(v)"], both("c")]);
  near(num, [32, 32]);
  const txt = trace(str16, "hello", [["c = write(0, v)", "const c = write(0, v)"]]);
  near(txt, [lg(17) + 5 * 7]);
});
