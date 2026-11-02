// The Haskell sandbox (MicroHs on WASI, engine/haskell.mjs): the pinned bundle, the capability boundary,
// determinism and the step budget, limits, compile diagnostics, the moves' encoding (identical to TypeScript's
// for the same moves), and the summon price. Rooms come from lib/game-types (test/haskell/rooms.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unpackHaskell, HASKELL_BUNDLE_SHA256 } from "../engine/haskell-bundle.mjs";
import { HaskellCompiler, HaskellExecutor, createHaskellEngine, REDUCTIONS_PER_STEP, compileMessage } from "../engine/haskell.mjs";
import { HaskellWasi } from "../engine/haskell-wasi.mjs";
import { hsTokenBits, tokenize } from "../engine/hs-token-bits.mjs";
import { createQuickJSExecutor } from "../engine/quickjs.mjs";
import { GameRuntime, typescriptPaths, COMPLEXITY_IDS, GRAMMAR_IDS } from "../index.mjs";

const ROOMS = JSON.parse(readFileSync(new URL("./haskell/rooms.json", import.meta.url), "utf8"));
const bundle = readFileSync(new URL("../dist/haskell-runtime.bin.gz", import.meta.url));
const files = unpackHaskell(bundle);
const { getQuickJS } = await import(new URL(`file://${typescriptPaths().quickjs}`).href);
const compiler = new HaskellCompiler({ compiler: await WebAssembly.compile(files.get("haskell-compiler.wasm")), files });
const executor = new HaskellExecutor({ evaluator: await WebAssembly.compile(files.get("haskell-evaluator.wasm")),
  quickjs: await createQuickJSExecutor({ getQuickJS }) });
const engine = createHaskellEngine({ compiler, executor });
const ts = new GameRuntime({ language: "typescript", execution: "inline" });

const room = (name, overrides = {}) => ({ ...ROOMS[name].settings, ...overrides });
const act = (source, input, settings = room("int"), seed = "1") => engine.run({ mode: "act", source, input, settings, seed });
const rejects = (fn, code, pattern) => assert.throws(fn, error => error.code === code && (!pattern || pattern.test(error.message)),
  `expected ${code} ${pattern ?? ""}`);
const agent = body => `agent :: Obj -> [Call]\nagent x = ${body}\n`;
/** The calls, or the error a failed act gives: both languages must give the same. */
const outcome = run => { try { return run().calls ?? run(); } catch (error) { return `${error.code}: ${error.message}`; } };
const outcomeAsync = async run => { try { return (await run()).calls; } catch (error) { return `${error.code}: ${error.message}`; } };

test("bundle: the pinned bytes only", () => {
  assert.match(HASKELL_BUNDLE_SHA256, /^[0-9a-f]{64}$/u);
  const raw = Buffer.from(bundle);
  raw[raw.length - 9] ^= 1;   // inside the gzip payload or its CRC: either way not the pinned bundle
  assert.throws(() => unpackHaskell(raw));
  assert.equal(GRAMMAR_IDS.haskell, "haskell-agent-v1");
  assert.equal(COMPLEXITY_IDS.haskell, "hs-token-bits-v1-uniform");
});

test("act: moves become the room's wire calls, the same as a TypeScript agent's", async () => {
  const cases = [
    ["int", agent("[add 3, setDigit 0 7, reflect]"), "function agent(x) { return [add(3), setDigit(0, 7), reflect()]; }"],
    ["intCommit", agent("onlyIfBetter [add 1, roundOff' 2]"), "function agent(x) { return onlyIfBetter([add(1), roundOff(2)]); }"],
    ["string", agent(`[write 0 "\\t\\"\\\\q", reverse, fill' "z" 2 5, swapChars 0 1]`),
      `function agent(x) { return [write(0, "\\t\\"\\\\q"), reverse(), fill("z", 2, 5), swapChars(0, 1)]; }`],
    ["grid", agent(`[swapCells (cell x 0 0) (1, 2), paint (row 2) "red", slide' (column 1) 2 "colour", turnSquare (square 1 1) "half", recolour [(0, 0), (1, 1), (2, 2), (3, 3)] "red" "blue", recolour diagonal "blue" "red"]`),
      `function agent(x) { return [swapCells(x.cell(0, 0), [1, 2]), paint(row(2), "red"), slide(column(1), 2, "colour"), turnSquare(square(1, 1), "half"), recolour([[0, 0], [1, 1], [2, 2], [3, 3]], "red", "blue"), recolour(diagonal(), "blue", "red")]; }`],
  ];
  for (const [name, hs, js] of cases) {
    const settings = room(name), input = ROOMS[name].samples[0];
    const theirs = await ts.act(js, input, settings, "1");
    assert.equal(act(hs, input, settings).calls, theirs.calls, name);
  }
});

test("act: the agent reads the object through the room's Haskell helpers", () => {
  assert.deepEqual(JSON.parse(act(agent("[setTo (fromDigits (digits x) + lowest - lowest)]"), -305, room("int")).calls),
    [["set", { value: 305 }]]);   // digits drops the sign, as in Python and TypeScript
  // String: the object is the wire text, control characters included.
  const s = ROOMS.string.samples[0];
  assert.deepEqual(JSON.parse(act(agent("[truncate (length x - maxLength + 3)]"), s, room("string")).calls), [["truncate", { n: 3 }]]);
  // Grid: tied neighbour links, rows/columns, regions and reachable on the decoded cells.
  const wire = ROOMS.grid.samples[0];
  const source = `agent :: Obj -> [Call]
agent g =
  let c = cell g 1 2
      Just r = right c
      n = length (regions g (\\a b -> colour a == colour b))
      k = length (reachable g [cell g 0 0] (const True))
  in [ write (cellRow r, cellCol r) (show (mod (length (neighbours c) + length (surrounding c)) 10))
     , paint (column n) (nextColour (colour c))
     , swapCells (head (head (columns g))) (last (head (diagonals g)))
     , setDigitCell k ]
  where setDigitCell k = paint [quarterTurn g (cell g 0 (k \`mod\` 4))] (head palette)
`;
  const cells = wire.split("/").map(line => line.split(","));
  const colour = { R: "red", G: "green", B: "blue", Y: "yellow" };
  const js = `function agent(g) {
    const c = g.cell(1, 2), r = c.right!;
    const n = g.regions((a, b) => a.colour === b.colour).length, k = g.reachable([g.cell(0, 0)], () => true).length;
    return [write([r.row, r.col], String((c.neighbours.length + c.surrounding.length) % 10)), paint(column(n), nextColour(c.colour)),
      swapCells(g.columns[0][0], g.diagonals[0][3]), paint([g.quarterTurn(g.cell(0, k % 4))], g.palette[0])];
  }`;
  assert.ok(colour[cells[1][2].slice(-1)]);
  return ts.act(js, wire, room("grid"), "1").then(theirs => assert.equal(act(source, wire, room("grid")).calls, theirs.calls));
});

test("act: suited and faced cards decode to suit and isPicture", async () => {
  const wire = ROOMS.cards.samples[0];
  const source = agent(`[write (0, 0) (show (length [c | c <- cells x, isPicture c]) ++ suit (cell x 0 1))]`);
  // Not a card symbol, so the room's constructor refuses it: both languages fail with the same message.
  const theirs = await outcomeAsync(() => ts.act(`function agent(x) { return [write([0, 0], String(x.cells.filter(c => c.isPicture).length) + x.cell(0, 1).suit)]; }`,
    wire, room("cards"), "1"));
  assert.match(theirs, /^EXECUTION: /u);
  assert.equal(outcome(() => act(source, wire, room("cards"))), theirs);
  const pictures = wire.split(/[,/]/u).filter(t => /^[JQK]/u.test(t)).length;
  const symbol = await ts.act(`function agent(x) { return [write([0, 0], x.cells.filter(c => c.isPicture).length > ${pictures - 1} ? "K" + "\u2665" : "A" + "\u2660")]; }`,
    wire, room("cards"), "1");
  assert.equal(act(agent(`[write (0, 0) (if length [c | c <- cells x, isPicture c] > ${pictures - 1} then "K\\9829" else "A\\9824")]`), wire, room("cards")).calls, symbol.calls);
});

test("determinism: the same act gives the same calls and steps; the budget is exact", () => {
  const source = agent("[add (sum [1 .. 2000] `mod` 7 + 1)]");
  const a = act(source, 5), b = act(source, 5);
  assert.deepEqual(a, b);
  assert.ok(a.steps > 100, `steps ${a.steps}`);
  assert.equal(a.usedRandom, false);
  // Exactly the steps used fit; one fewer does not (checked at the end, not only every 10,000 reductions).
  assert.deepEqual(act(source, 5, room("int", { stepBudget: a.steps })), a);
  rejects(() => act(source, 5, room("int", { stepBudget: a.steps - 1 })), "LIMIT", /Step limit exceeded/u);
  assert.ok(REDUCTIONS_PER_STEP >= 1);
});

test("limits: an endless loop stops at the step budget, a huge structure at the memory cap", () => {
  rejects(() => act(agent("let loop n = loop (n + 1) in [add (loop 0)]"), 1, room("int", { stepBudget: 20000 })), "LIMIT", /Step limit exceeded/u);
  rejects(() => act(agent("[add (length (show [1 .. 10000000 :: Integer]))]"), 1, room("int", { stepBudget: 10000000 })), "LIMIT", /memory|Step/u);
  // Too many moves for the call list.
  rejects(() => act(agent("replicate 100000 (add 1)"), 1, room("int", { stepBudget: 10000000 })), "LIMIT");
});

test("capabilities: no files, no processes; time is the virtual clock", () => {
  const io = body => `import System.IO.Unsafe (unsafePerformIO)\n${agent(`[add (unsafePerformIO (${body}))]`)}`;
  rejects(() => act(io(`fmap length (readFile "/etc/passwd")`), 1), "EXECUTION");
  rejects(() => act(io(`fmap length (readFile "../../etc/passwd")`), 1), "EXECUTION");
  rejects(() => act(io(`writeFile "/out/x" "y" >> writeFile "/agent.comb" "" >> return 1`), 1), "EXECUTION");
  // The host's import table directly: no escape from the tree, no writes outside /out, the virtual clock.
  const host = new HaskellWasi({ files: new Map([["a/b", new Uint8Array([1])]]), args: [], stdoutMax: 16 });
  host.memory = new WebAssembly.Memory({ initial: 1 });
  const path = new TextEncoder().encode("../x");
  new Uint8Array(host.memory.buffer).set(path, 100);
  assert.equal(host.wasi_path_open(3, 0, 100, path.length, 0, 0n, 0n, 0, 200), 76);   // ENOTCAPABLE
  new Uint8Array(host.memory.buffer).set(new TextEncoder().encode("a/b"), 100);
  assert.equal(host.wasi_path_open(3, 0, 100, 3, 1, 0n, 0n, 0, 200), 69);             // O_CREAT outside /out: EROFS
  assert.equal(host.wasi_clock_time_get(0, 0n, 300), 0);
  assert.equal(new DataView(host.memory.buffer).getBigUint64(300, true), 1767225600n * 1000000000n + 1000n);
});

test("compile: diagnostics name the player's own lines", () => {
  rejects(() => act("agent :: Obj -> [Call]\nagent x = [add (x ++ 1)]\n", 1), "COMPILE", /^line 2, column \d+: type mismatch[\s\S]*2 \| agent x/u);
  rejects(() => act("helper = 1\n", 1), "COMPILE", /must define agent at the top level/u);
  rejects(() => act("agent = 3\n", 1), "COMPILE", /agent :: Obj -> \[Call\]/u);
  rejects(() => act("module Agent where\nagent x = []\n", 1), "COMPILE", /module header/u);
  rejects(() => act("agent x = [add\n", 1), "COMPILE", /^line \d+/u);
  assert.match(compileMessage("Room.hs:3:1: error: x", 2), /room's Haskell helpers/u);
  // A room move that Data.List also exports: the diagnostic says how to use both.
  rejects(() => act("import Data.List\nagent :: Obj -> [Call]\nagent s = [reverse]\n", "ab", room("string")), "COMPILE",
    /^line 3, column \d+: ambiguous value: reverse[\s\S]*import qualified Data\.List as L/u);
  assert.equal(JSON.parse(act("import qualified Data.List as L\nagent :: Obj -> [Call]\nagent s = [reverse' (length (L.sort s)) 0 | False]\n", "ab", room("string")).calls).length, 0);
});

test("moves: only the room's move helpers and areas reach its JavaScript", () => {
  rejects(() => act(agent(`[Call "__decode" []]`), 1), "EXECUTION", /not a move in this room/u);
  rejects(() => act(agent(`[Call "add" [JCall "Function" [JStr "return 1"]]]`), 1), "EXECUTION", /not an area in this room/u);
  rejects(() => act(agent(`[add 1, onlyIfBetter [add 2] !! 0]`), 1, room("intCommit")), "EXECUTION", /onlyIfBetter must wrap/u);
});

test("price: hs-token-bits-v1-uniform is alpha-equivalent, ignores comments, and grows with the program", () => {
  const settings = room("int");
  const cost = source => compiler.inspect(source, settings).cost;
  const base = cost(agent("[add (x + 1)]"));
  assert.equal(cost("-- a comment\n{- and {- nested -} -}\n" + agent("[add (x + 1)]")), base);
  assert.equal(cost("agent :: Obj -> [Call]\nagent y = [add (y + 1)]\n"), base);
  assert.equal(cost("agent x = [add (x + 1)]\n"), base, "the grammar's signature line is free");
  assert.ok(cost("agent :: Int -> [Call]\nagent x = [add (x + 1)]\n") > base, "any other signature is code");
  assert.ok(cost(agent("[add (x + 1), add (x + 2)]")) > base);
  assert.ok(cost(agent("[add (x + 100000)]")) > base);
  const inspection = engine.run({ mode: "inspect", source: agent("[add 1]"), settings });
  assert.deepEqual(inspection.literalMoves, []);
  assert.deepEqual(Object.keys(inspection.parts).sort(), ["literals", "moveFlags", "names", "structure"]);
  assert.deepEqual(tokenize("x = \"a\\\"b\" -- c\n").map(t => t.kind), ["break", "name", "special", "string"]);
  // A block comment keeps the layout: the token after it is at its real column, a break inside it still counts.
  assert.deepEqual(tokenize("{- a -} x\n{- b\n -}  y").filter(t => t.kind === "break").map(t => t.column), [8, 5]);
  assert.ok(cost(agent("[add (x + 1.0)]")) > base, "1.0 is a float, not the whole number 1");
  assert.ok(hsTokenBits(agent("[add 1]"), settings.prelude.haskell, []).parts.moveFlags > 0);
});

test("pool: worker and inline agree, compilation is cached", async () => {
  const source = agent("[add (x `mod` 9 + 1)]"), settings = room("int");
  const worker = new GameRuntime({ language: "haskell", workers: 2 });
  const inline = new GameRuntime({ language: "haskell", execution: "inline" });
  try {
    const inputs = [3, -11, 1000];
    const a = await Promise.all(inputs.map((x, i) => worker.act(source, x, settings, String(i))));
    const b = [];
    for (const [i, x] of inputs.entries()) b.push(await inline.act(source, x, settings, String(i)));
    assert.deepEqual(a, b);
    assert.equal((await worker.inspect(source, settings)).complexityFunctionId, "hs-token-bits-v1-uniform");
    await assert.rejects(worker.script("main = 1", "{}"), error => error.code === "CONFIG");
  } finally { worker.close(); inline.close(); }
});
