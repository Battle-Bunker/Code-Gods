import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { GRID, INT, OBJECT_TYPES, STRING, availableMutators, instanceInfo, seededRng, sha256, withCommitClause, type Instantiation } from "../src/index.ts";
import { buildFixture } from "./parity-fixture.ts";

const JS_GLOBALS = new Set([...Object.getOwnPropertyNames(globalThis), "escape", "unescape", "print", "name", "length", "self", "window"]);

function topLevelJs(js: string): string[] {
  return [...js.matchAll(/^(?:const|let|var|function|class) (\w+)/gm)].map(m => m[1]);
}

/** Run JS after the instantiation's prelude in a fresh realm; objects come back as plain JSON data. */
function run(inst: Instantiation, body: string): any {
  const out = runInNewContext(`${OBJECT_TYPES.find(t => t.id === inst.objectType)!.prelude(inst).js}\n${body}`, {});
  return out !== null && typeof out === "object" ? JSON.parse(JSON.stringify(out)) : out;
}

for (const type of OBJECT_TYPES) {
  for (const args of type.representatives()) {
    const inst = type.instantiate(args);
    test(`prelude ${inst.key}`, () => {
      const p = type.prelude(inst), wire = type.codec(inst).encode(type.spawn(inst, seededRng(inst.key)));
      assert.equal(p, type.prelude(inst), "memoised");
      assert.match(p.hash, /^[0-9a-f]{64}$/);
      for (const name of topLevelJs(p.js)) {
        assert.ok(name.startsWith("__") || !JS_GLOBALS.has(name), `${name} shadows a JS global`);
        assert.ok(!name.startsWith("__") || /^__[A-Z0-9_]+$|^__[a-z_]+$/.test(name), `${name}: private names are __UPPER`);
      }
      assert.ok(/^def __decode\(wire\):/m.test(p.python) && /^def __encode_calls\(calls\):/m.test(p.python));
      const info = instanceInfo(inst);
      assert.equal(info.key, inst.key);
      assert.deepEqual(info.mutators.map(m => m.id), availableMutators(inst).map(m => m.id));
      assert.ok(JSON.stringify(info).length > 0, "instance info is JSON");
      if (type.id !== "Grid") {
        assert.equal(run(inst, `__decode(${JSON.stringify(wire)})`), wire);
        return;
      }
      const cards = inst.args.symbols === "cards", mixable = inst.classes.includes("Mixable");
      assert.equal(/^def mix\(/m.test(p.python), mixable);
      assert.equal(/^function mix\(/m.test(p.js), mixable);
      assert.equal(p.helpers.some(h => h.name.python === "cell.suit"), cards);
      assert.equal(p.helpers.some(h => h.name.typescript === "cell.isPicture"), cards);
      const n = inst.args.size as number;
      // Board laws on the JS side: neighbours symmetric and irreflexive, surrounding ⊇ neighbours.
      const ok = run(inst, `
        const g = __decode(${JSON.stringify(wire)});
        g.cells.every((c) => c.neighbours.every((d) => d !== c && d.neighbours.includes(c))
          && c.neighbours.every((d) => c.surrounding.includes(d)) && Object.isFrozen(c))
          && g.cells.length === ${n * n} && g.edgeCells.length === ${4 * n - 4};`);
      assert.equal(ok, true);
    });
  }
}

test("kid API values match the host tables", () => {
  const inst = GRID.instantiate({ size: 3, symbols: "cards", colours: "rainbow6" }), codec = GRID.codec(inst);
  const wire = "KHV,ASR,TDO/2CY,QSG,JHB/9DV,8CR,AHG";
  const cells = run(inst, `__decode(${JSON.stringify(wire)}).cells.map((c) => [c.symbol, c.value, c.colour, c.suit, c.isPicture])`);
  assert.deepEqual(cells[0], ["K♥", 13, "violet", "hearts", true]);
  assert.deepEqual(cells[2], ["10♦", 10, "orange", "diamonds", false]);
  assert.ok(codec.isValid(wire));
  assert.deepEqual(run(inst, `[mix("red", "yellow"), mix("blue", "yellow"), mix("red", "red"), nextColour("violet")]`), ["orange", "green", null, "red"]);
  assert.throws(() => run(inst, `nextColour("pink")`));
  assert.throws(() => run(inst, `__decode("KHV")`));
  assert.throws(() => run(inst, `__decode(${JSON.stringify(wire)}).cell(3, 0)`));
  const ints = INT.instantiate({ min: 0, max: 9999 });
  assert.deepEqual(run(ints, `[digits(-305), fromDigits([3, 0, 5]), LOWEST, HIGHEST]`), [[3, 0, 5], 305, 0, 9999]);
  assert.throws(() => run(ints, `__decode(10000)`));
  assert.equal(run(STRING.instantiate({ maxLength: 3 }), "MAX_LENGTH"), 3);
});

test("__encode_calls", () => {
  const inst = GRID.instantiate({});
  const enc = (calls: string) => run(inst, `__encode_calls(${calls})`);
  assert.equal(enc("null"), "[]");
  assert.equal(enc(`{__m: "x"}`), `[["x",{}]]`);
  assert.equal(enc(`[{__m: "swap", b: [1, 2], a: "é"}]`), `[["swap",{"a":"\\u00e9","b":[1,2]}]]`);
  assert.throws(() => enc(`Array.from({length: 17}, () => ({__m: "x"}))`), /at most 16/);
  assert.throws(() => enc(`[{m: "x"}]`), /move helper/);
  assert.throws(() => enc(`[{__m: "x", k: 1.5}]`), /whole numbers/);
  assert.throws(() => enc(`"swap"`), /list of moves/);
});

/** Type-check TS source against a prelude's dts (the TS rooms' agent and card checker does the same). */
function diagnostics(dts: string, source: string): string[] {
  const files: Record<string, string> = { "/prelude.d.ts": dts, "/card.ts": source };
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, lib: ["lib.es2022.d.ts"], types: [] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, lang, ...rest) => name in files ? ts.createSourceFile(name, files[name], lang) : read(name, lang, ...rest);
  host.fileExists = name => name in files || ts.sys.fileExists(name);
  host.readFile = name => files[name] ?? ts.sys.readFile(name);
  const program = ts.createProgram(Object.keys(files), options, host);
  return ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

test("dts type-checks kid cards, and only offers the room's helpers", () => {
  const sandwich = `
    const MY_COLOUR = "blue";
    function isMine(cell: Cell | null): boolean { return cell !== null && cell.colour === MY_COLOUR; }
    function utility(grid: Grid): Score {
      let sandwiches = 0;
      for (const cell of grid.cells) {
        if (isMine(cell)) continue;
        if (isMine(cell.left) && isMine(cell.right)) sandwiches += 1;
        if (isMine(cell.up) && isMine(cell.down)) sandwiches += 1;
      }
      const regions = grid.regions((a, b) => a.colour === b.colour).length;
      return [sandwiches, regions, grid.reachable(grid.edgeCells, (c) => c.onEdge).length, grid.quarterTurn(grid.cell(0, 0)).row];
    }
    const calls: string = __encode_calls([]);
    utility(__decode("")); nextColour("red");`;
  const cards = GRID.instantiate({ size: 5, symbols: "cards", colours: "rainbow6" }), digits = GRID.instantiate({ size: 4, symbols: "base10", colours: "rgb" });
  assert.deepEqual(diagnostics(GRID.prelude(digits).dts, sandwich), []);
  const fancy = `${sandwich}\nconst s: Suit = __decode("").cells[0].suit; const p: boolean = __decode("").cells[0].isPicture; mix("red", "yellow");`;
  assert.deepEqual(diagnostics(GRID.prelude(cards).dts, fancy), []);
  const errs = diagnostics(GRID.prelude(digits).dts, fancy);
  assert.ok(errs.some(e => /suit/.test(e)) && errs.some(e => /isPicture/.test(e)) && errs.some(e => /mix/.test(e)), errs.join("\n"));
  assert.deepEqual(diagnostics(INT.prelude(INT.instantiate({})).dts, `const d: number[] = digits(LOWEST); fromDigits(d); __decode(3);`), []);
  assert.deepEqual(diagnostics(STRING.prelude(STRING.instantiate({})).dts, `const n: number = MAX_LENGTH; __decode("x");`), []);
});

test("parity fixture (consumed by test/parity.py)", () => {
  const fixture = buildFixture();
  assert.ok(fixture.cases.length >= 12 && fixture.cases.every(c => c.grids.length === 5));
  const keys = new Set(fixture.cases.map(c => c.key));
  for (const s of ["base10", "base12", "base16", "cards"]) for (const c of ["rgb", "rgby", "rainbow6"])
    assert.ok([...keys].some(k => k.includes(`,${s},${c})`)), `covers ${s} × ${c}`);
  const dir = new URL("./fixtures/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("prelude-parity.json", dir), JSON.stringify(fixture));
});

// The derived fields (pricing vocabulary, hash) are computed on first read (prelude.ts withDerived, so describing an
// instance stays cheap); every way of reading them sees the same frozen values, as when they were plain fields.
test("a prelude's hash and pricing read the same, frozen, through every access path", () => {
  for (const type of OBJECT_TYPES) {
    const inst = type.instantiate(type.representatives()[0]);
    for (const p of [type.prelude(inst), withCommitClause(type.prelude(inst))]) {
      assert.equal(p.hash, sha256(`${p.python}\0${p.js}\0${p.dts}`), `${inst.key}: the hash is of the three texts`);
      assert.equal(p.pricing, p.pricing, "one vocabulary object, however often it is read");
      assert.ok(Object.isFrozen(p) && Object.isFrozen(p.pricing), "frozen");
      const plain = JSON.parse(JSON.stringify(p));
      assert.equal(plain.hash, p.hash);
      assert.deepEqual(plain.pricing, JSON.parse(JSON.stringify(p.pricing)));
      assert.deepEqual(Object.keys({ ...p }).sort(), ["dts", "hash", "helpers", "js", "pricing", "python"]);
      assert.equal(Object.fromEntries(Object.entries(p)).hash, p.hash);
    }
    assert.ok(withCommitClause(type.prelude(inst)).pricing.typescript.api.includes("onlyIfBetter"), "the clause adds its name");
  }
});
