// Hostile regression suites for the Python host on Node's WebAssembly: the former python/test_reactor.py,
// test_runner.py, test_sandbox.py and test_astbits.py (wasmtime-py), ported call for call, plus the
// checks the new host needs (WASI capability table, memory cap, worker watchdog, bundle pin, inline mode).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unpack, pack, PYTHON_BUNDLE_SHA256 } from "../engine/bundle.mjs";
import { PythonEngine } from "../engine/python.mjs";
import { immutableTable, MEMORY_MAX_PAGES } from "../engine/reactor.mjs";
import { Wasi, EPOCH_NS } from "../engine/wasi.mjs";
import { GameRuntime, loadPythonRuntime } from "../index.mjs";

const here = new URL(".", import.meta.url);
const FIXTURE = JSON.parse(readFileSync(new URL("./fixture-prelude.json", here), "utf8"));
const INTS = { ...FIXTURE, interactionComputeMs: 5 };
const STRINGS = { ...INTS, objectType: "string", wireMaxLength: 256 };
const ROOMY = { ...INTS, interactionComputeMs: 1000 };
const VECTORS = JSON.parse(readFileSync(new URL("./ast-bits-v1-vectors.json", here), "utf8"));
const parity = JSON.parse(readFileSync(new URL("./parity/cases.json", here), "utf8"));
const GRIDLAB = parity.settings.find(s => s.prelude.key === "gridlab-vocab");
const EPOCH_US = 1767225600n * 1000000n;
const agent = body => `def agent(x):\n    return ${body}\n`;
const bundleBytes = readFileSync(new URL("../dist/python-runtime.bin.gz", here));
const files = unpack(bundleBytes);
const engine = new PythonEngine({ files });

const run = (mode, source, { value = 1, settings = INTS, seed = "1", ...rest } = {}) =>
  engine.run({ mode, source, input: value, settings, seed, ...rest });
const act = (source, value = 1, settings = INTS, seed = "1") => run("act", source, { value, settings, seed }).calls;
const k = (body, value = 1, settings = INTS) => JSON.parse(act(agent(`[add(${body})]`), value, settings))[0][1].k;
const ks = (source, seed = "1", settings = ROOMY) => JSON.parse(act(source, 1, settings, seed)).map(([, p]) => p.k);
const rejects = (fn, code, pattern) => assert.throws(fn, error => (code ? (Array.isArray(code) ? code.includes(error.code) : error.code === code) : true)
  && (!pattern || pattern.test(error.message)), `expected ${code} ${pattern ?? ""}`);

// --- test_reactor.py: warm reactor isolation, capability and budget regression checks.
test("reactor: identity under the default 5 ms budget, virtual time and seeded entropy", () => {
  for (let i = 0; i < 30; i++) assert.equal(k("x"), 1);
  assert.equal(k(`int(__import__('time').time() * 1e6) - ${EPOCH_US}`), 1);
  assert.equal(k(`int(len.__self__.__import__('time').time() * 1e6) - ${EPOCH_US}`), 1);
  const draws = new Set(Array.from({ length: 4 }, () => k("__import__('random').randrange(2147483647)")));
  assert.equal(draws.size, 1, "the same seed draws the same numbers");
});

test("reactor: no guest files or external I/O, directly or past the proxies", () => {
  for (let body of ["open('/etc/passwd').read()", "B.open('/etc/passwd').read()", "B.open('/lib/python3.15/random.py').read()",
    "B.open('/tmp/owned', 'w').write('bad')", "B.__import__('os').write(1, b'forged')", "B.__import__('os').read(0, 1)",
    "B.__import__('os').listdir('/lib')", "B.__import__('socket').socket()", "B.__import__('os').system('true')",
    "__import__('time').sleep(1)", "B.__import__('time').sleep(1)", "B.__import__('sys').exit(0)",
    "int(B.__import__('os').stat('/lib/python3.15/os.py').st_mtime)", "B.__import__('os').getcwd()",
    "B.__import__('os').open('/lib/python3.15/os.py', 0)", "B.__import__('os').mkdir('/lib/x')"]) {
    body = body.replaceAll("B.", "len.__self__.");
    rejects(() => act(agent(body), 1, ROOMY), ["EXECUTION", "LIMIT"], undefined);
  }
  assert.equal(k("x"), 1);
});

test("reactor: the snapshot resets modules, builtins and prelude state", () => {
  const poisonBuiltins = "builtins = len.__self__\nbuiltins._poison = getattr(builtins, '_poison', 0) + 1\ndef agent(x):\n    return [add(builtins._poison)]\n";
  for (let i = 0; i < 5; i++) assert.equal(act(poisonBuiltins), '[["add",{"k":1}]]');
  const poisonMath = "math = len.__self__.__import__('math')\nmath._poison = getattr(math, '_poison', 0) + 1\ndef agent(x):\n    return [add(math._poison)]\n";
  for (let i = 0; i < 5; i++) assert.equal(act(poisonMath), '[["add",{"k":1}]]');
  rejects(() => act("_JSON.dumps = lambda *a, **k: 'poison'\ndef agent(x):\n    return []"), "EXECUTION", /read-only/);
  rejects(() => act("import math\nmath.memo = 1\ndef agent(x):\n    return []"), "EXECUTION", /read-only/);
  act("len.__self__.__import__('json').dumps = lambda *a, **k: 'poison'\ndef agent(x):\n    return []");
  assert.equal(k("x"), 1);
  // Cross-agent poisoning.
  act("builtins = len.__self__\nbuiltins.len = lambda x: 999\ndef agent(x):\n    return []");
  assert.equal(k("len('abc')"), 3);
  act("sys = len.__self__.__import__('sys')\nsys.modules.clear()\ndef agent(x):\n    return []");
  assert.equal(k("__import__('math').isqrt(81)"), 9);
});

test("reactor: varied cached agents have pristine globals; cache keys include the prelude", () => {
  const sources = Array.from({ length: 8 }, (_, i) => agent(`[add(x + ${i})]`));
  for (const source of sources) run("inspect", source);
  for (let round = 0; round < 3; round++) {
    act("builtins = len.__self__\nbuiltins._poison = 99\nadd = None\ndef agent(x):\n    return []");
    sources.forEach((source, i) => assert.equal(act(source), `[["add",{"k":${i + 1}}]]`));
    assert.equal(k("getattr(len.__self__, '_poison', 0)"), 0);
  }
  assert.ok(engine.cache.size >= 9);
  for (const { value, size } of engine.cache.map.values()) {
    assert.ok(value.blob instanceof Uint8Array && value.blob.length < 1024 * 1024 && size >= value.blob.length);
  }
  const source = agent("[add(x)]");
  assert.equal(act(source, 4), '[["add",{"k":4}]]');
  const doubled = { ...INTS, prelude: { ...INTS.prelude, key: "doubled", python: INTS.prelude.python + "\ndef __decode(w):\n    return 2 * w\n" } };
  assert.equal(act(source, 4, doubled), '[["add",{"k":8}]]');
  // Same key, different text: the engine's own digest still separates the entries.
  const forged = { ...doubled, prelude: { ...doubled.prelude, key: INTS.prelude.key } };
  assert.equal(act(source, 4, forged), '[["add",{"k":8}]]');
  assert.equal(act(source, 4), '[["add",{"k":4}]]');
});

test("reactor: the compiled-code cache is an LRU bounded by entries and bytes", () => {
  for (let i = 0; i < 132; i++) run("inspect", agent(`[add(x + ${i + 1000})]`));
  assert.ok(engine.cache.size <= 128);
  assert.ok(engine.cache.bytes <= 4 * 1024 * 1024);
  assert.equal(engine.cache.bytes, [...engine.cache.map.values()].reduce((n, item) => n + item.size, 0));
  assert.equal(k("x"), 1);
});

test("reactor: monkeypatched encoders only produce a string; result hooks are never invoked", () => {
  assert.equal(act("def __encode_calls(c):\n    return 'not json'\ndef agent(x):\n    return []"), "not json");
  assert.equal(act("_DUMPS = lambda *a, **k: '[[\"forged\",{}]]'\ndef agent(x):\n    return []"), '[["forged",{}]]');
  for (const [body, code] of [
    ["type('str', (str,), {'__str__': lambda self: sum(iter(lambda: 1, 0))})('[]')", "DOMAIN"],
    ["type('int', (), {'__int__': lambda self: sum(iter(lambda: 1, 0))})()", "DOMAIN"],
    ["b'[]'", "DOMAIN"], ["None", "DOMAIN"], ["'[\"é\"]'", "DOMAIN"], ["'\\udc80'", "DOMAIN"], ["'[' * 65537", "LIMIT"],
  ]) rejects(() => act(`def __encode_calls(c):\n    return ${body}\ndef agent(x):\n    return []`), code);
  assert.equal(act("def __encode_calls(c):\n    return '[' * 65536\ndef agent(x):\n    return []").length, 65536);
  assert.equal(k("x"), 1);
  rejects(() => act(agent("[add('a' * 70000)]")), "LIMIT");
  rejects(() => act(agent("[{}]")), "EXECUTION");   // the fixture encoder raises on a malformed call
});

test("reactor: memory growth, the 128 MiB cap and deep recursion do not poison the next act", () => {
  // Growth (70 MB of a 128 MiB cap) succeeds; the grown instance is replaced before the next act, which
  // sees exactly what an act on a never-grown instance sees.
  const address = act(agent("[add(repr(object()))]"), 1, ROOMY);
  assert.equal(act(agent("(bytearray(70000000), [])[1]"), 1, ROOMY), "[]");
  assert.ok(engine.memory.buffer.byteLength > 64 * 1024 * 1024);
  assert.equal(act(agent("[add(repr(object()))]"), 1, ROOMY), address);
  assert.equal(engine.memory.buffer.byteLength, engine.snapshot.length);
  assert.equal(k("x"), 1);
  // Under the 5 ms budget the same allocation is a time limit or completes; either way nothing leaks.
  try { act(agent("(bytearray(70000000), [])[1]")); } catch (error) { assert.equal(error.code, "LIMIT"); }
  assert.equal(k("x"), 1);
  rejects(() => act(agent("[add(len(bytearray(200 * 1024 * 1024)))]"), 1, ROOMY), "EXECUTION", /MemoryError/);
  assert.equal(k("x"), 1);
  rejects(() => act("def f(n):\n    return f(n)\ndef agent(x):\n    return [add(f(x))]\n", 1, ROOMY), "EXECUTION", /RecursionError/);
  // Deep recursion inside C (repr of a deeply nested list): CPython's guard or the Wasm stack.
  rejects(() => act(agent("[add(len(repr(__import__('functools').reduce(lambda a, _: [a], range(200000), []))))]"), 1, ROOMY), ["EXECUTION", "LIMIT"]);
  assert.equal(k("x"), 1);
  assert.equal(new WebAssembly.Memory({ initial: 1, maximum: MEMORY_MAX_PAGES }).buffer.byteLength, 65536);
  assert.ok(engine.memory.buffer.byteLength <= MEMORY_MAX_PAGES * 65536);
  assert.throws(() => engine.memory.grow(MEMORY_MAX_PAGES), RangeError, "the reactor's memory is capped at 128 MiB");
  engine.poisoned = true;   // that grow attempt is ours, not a guest's: start the next act from a new instance anyway
  assert.equal(k("x"), 1);
});

test("reactor: the table-mutation decoder fails closed", () => {
  for (const instruction of [[0x26, 0x00], [0xfc, 0x0f, 0x00], [0xfc, 0x0c, 0x00, 0x00]]) {
    const body = [0, ...instruction, 0x0b];
    assert.throws(() => immutableTable(Uint8Array.from([1, body.length, ...body])));
  }
  // i32.const 0; drop; end: no table instruction.
  assert.doesNotThrow(() => immutableTable(Uint8Array.from([1, 5, 0, 0x41, 0x00, 0x1a, 0x0b])));
  // The pinned module passed it at build time; the shipped reactor still decodes cleanly.
  const wasm = files.get("python-reactor.wasm");
  let at = 8;
  while (at < wasm.length) {
    const kind = wasm[at];
    let size = 0, shift = 0, p = at + 1;
    for (;;) { const b = wasm[p++]; size += (b & 127) * 2 ** shift; shift += 7; if (b < 128) break; }
    if (kind === 10) assert.doesNotThrow(() => immutableTable(wasm.subarray(p, p + size)));
    at = p + size;
  }
});

test("reactor: the execute phase follows trusted preparation and never happens at inspection", () => {
  const phases = [];
  engine.run({ mode: "act", source: agent("[]"), input: 1, settings: INTS, seed: "1" }, { onExecute: () => phases.push("execute") });
  engine.run({ mode: "inspect", source: agent("[]"), settings: INTS }, { onExecute: () => phases.push("wrong") });
  assert.deepEqual(phases, ["execute"]);
  // A slow prelude and decode are outside the 5 ms budget.
  const slow = { ...INTS, prelude: { ...INTS.prelude, key: "slow", python: INTS.prelude.python
    + "\n_TABLE = sum(range(3_000_000))\ndef __decode(w):\n    sum(range(3_000_000))\n    return w\n" } };
  assert.equal(act(agent("[add(x)]"), 3, slow), '[["add",{"k":3}]]');
  // Inspection never evaluates.
  assert.equal(run("inspect", agent("x")).astBytes, 7);
  assert.ok(run("inspect", "__import__('sys').exit(42)\ndef agent(x):\n    return x").cost > 0);
});

// --- test_runner.py
test("runner: calls, the standard library, inputs and inspection", () => {
  assert.equal(act(agent("[add(__import__('math').isqrt(x))]"), 81), '[["add",{"k":9}]]');
  assert.equal(act(agent("[add(len(x[::-1]))]"), "abc", STRINGS), '[["add",{"k":3}]]');
  const module = "import math\nSTEP = 2\n\ndef helper(n):\n    return n * STEP\n\nclass Box:\n    pass\n\ndef agent(grid):\n    return [add(helper(grid)), add(math.isqrt(16))]\n";
  assert.deepEqual(JSON.parse(act(module, 5)), [["add", { k: 10 }], ["add", { k: 4 }]]);
  assert.equal(act(agent("[]")), "[]");
  assert.equal(act(agent("[add(x)]"), 2 ** 53 - 1), `[["add",{"k":${2 ** 53 - 1}}]]`);
  for (const bad of [2 ** 53, true, 1.5, "é", "a".repeat(257)]) rejects(() => act(agent("[]"), bad, STRINGS), "DOMAIN");
  assert.equal(run("inspect", "def agent(x):\n    return x").astBytes, 7);
  assert.ok(run("inspect", "import sys\nsys.exit(42)\ndef agent(x):\n    return []").cost > 0);
  const bigger = { ...INTS, prelude: { ...INTS.prelude, python: INTS.prelude.python + "\nZ = 1\n", key: "other" } };
  assert.equal(run("inspect", "def agent(x):\n    return x", { settings: bigger }).cost, run("inspect", "def agent(x):\n    return x").cost);
  // Inventory: representative workloads of the preloaded computational modules (python/inventory.py).
  for (const [body, value, expected] of [
    ["__import__('math').isqrt(x)", 81, 9], ["sum(__import__('itertools').islice(__import__('itertools').count(), x))", 5, 10],
    ["__import__('functools').reduce(lambda a,b:a+b, range(x))", 5, 10], ["__import__('collections').Counter(x)['a']", "banana", 3],
    ["__import__('re').sub('[0-9]', '', x)", "a1b2", "ab"], ["__import__('json').loads(x)['a']", '{"a":"b"}', "b"],
    ["int(__import__('decimal').Decimal(x).sqrt())", 81, 9], ["int(__import__('fractions').Fraction(x, 3))", 9, 3],
    ["int(__import__('statistics').mean([x, x+2]))", 2, 3],
    ["__import__('hashlib').sha256(x.encode()).hexdigest()", "", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ]) assert.equal(k(body, value, typeof value === "number" ? ROOMY : { ...STRINGS, interactionComputeMs: 1000 }), expected, body);
});

test("runner: the grammar, explained errors, environment and stdio", () => {
  for (const [source, message] of [
    ["lambda x: x", /named agent/], ["def agentx(x):\n    return []", /named agent/],
    ["def f():\n    def agent(x):\n        return []", /named agent/], ["async def agent(x):\n    return []", /async/],
    ["def agent():\n    return []", /exactly one argument/], ["def agent(a, b):\n    return []", /exactly one argument/],
    ["def agent(x, *, k):\n    return []", /exactly one argument/],
    ["def agent(x):\n    return []\ndef agent(x):\n    return []", /more than once/], ["def agent(x):\n    return [add(x)", /line 2/],
    ["def agent(x):\n    return [t'{x}']\n", /price table does not cover/], ["def agent(x):\n    return \0", /NUL-free/],
  ]) rejects(() => run("inspect", source), "COMPILE", message);
  for (const source of ["def agent(x, y=1):\n    return []", "def agent(*args):\n    return []"]) run("inspect", source);
  rejects(() => act("def agent(x):\n    return [add(x // 0)]"), "EXECUTION", /ZeroDivisionError: division by zero \(line 2\)/);
  rejects(() => act("raise ValueError('top')\ndef agent(x):\n    return []"), "EXECUTION", /module raised/);
  rejects(() => act("def agent(x):\n    return []\ndel agent"), "EXECUTION", /no longer defines agent/);
  rejects(() => act(agent("open('/etc/passwd').read()")), "EXECUTION");
  rejects(() => act(agent("[add(len(__import__('os').environ))]")), "EXECUTION", /not available to agents/);
  // Past the proxies (len.__self__ is the real builtins module): an empty environment.
  assert.equal(act(agent("[add(len(len.__self__.__import__('os').environ))]")), '[["add",{"k":1}]]');
  // print does nothing; the real stdout refuses writes.
  assert.equal(act(agent(`(print('[["add",{"k":0}]]'), [])[1]`)), "[]");
  rejects(() => act(agent(`(len.__self__.print('[["add",{"k":0}]]'), [])[1]`)), "EXECUTION");
});

test("runner: bad settings and broken preludes are CONFIG", () => {
  for (const settings of [{ ...INTS, prelude: null }, { ...INTS, wireMaxLength: 1025 }, { ...INTS, objectType: "" },
    { ...INTS, interactionComputeMs: 0 }, { ...INTS, prelude: { ...INTS.prelude, key: "" } },
    { ...INTS, prelude: { ...INTS.prelude, python: "x".repeat(65537) } }])
    rejects(() => run("inspect", agent("[]"), { settings }), "CONFIG");
  for (const [python, key] of [["def __decode(:\n", "broken"], ["raise SystemExit(3)\n", "raising"], ["def __decode(w):\n    return w\n", "no-encoder"]])
    rejects(() => act(agent("[]"), 1, { ...INTS, prelude: { ...INTS.prelude, python, key } }), "CONFIG");
  rejects(() => run("inspect", agent("[]"), { pricingScheme: "made-up" }), "CONFIG");
});

// --- test_sandbox.py: virtual clock, seeded random, steps.
test("sandbox: the virtual clock restarts every act", () => {
  const src = agent(`[add(int(t.time() * 1e6) - ${EPOCH_US}) for t in [__import__('time')] * 3]`);
  assert.deepEqual(ks(src), [1, 2, 3]);
  assert.deepEqual(ks(src), [1, 2, 3], "the clock restarts every act");
  const both = agent(`[add(__import__('time').time_ns() - ${EPOCH_US * 1000n}), add(__import__('time').monotonic_ns() - ${EPOCH_US * 1000n})]`);
  assert.deepEqual(ks(both), [1000, 2000]);
  rejects(() => act(agent("[add(__import__('time').sleep(0.1))]")));
});

test("sandbox: random is Random(seed); Random() and seed() draw from it; SystemRandom is unavailable", () => {
  const src = agent("[add(__import__('random').getrandbits(30)) for _ in range(3)]");
  const a = ks(src, "42");
  assert.deepEqual(a, ks(src, "42"));
  assert.deepEqual(a, ks(src, "0x2a"));
  assert.deepEqual(a, [686579303, 119540831, 26855092], "random is Random(seed) (CPython's own Random(42))");
  assert.notDeepEqual(ks(src, "43"), a);
  const fresh = agent("[add(__import__('random').Random().getrandbits(20))]");
  assert.deepEqual(ks(fresh, "7"), ks(fresh, "7"));
  const reseed = "import random\nrandom.seed()\ndef agent(x):\n    return [add(random.getrandbits(20))]\n";
  assert.deepEqual(ks(reseed, "7"), ks(reseed, "7"));
  rejects(() => act(agent("[add(__import__('random').SystemRandom().random())]")), undefined, /SystemRandom/);
  for (const bad of [null, "", "-1", "18446744073709551616", "0x1ffffffffffffffff", "1.5", "abc"])
    rejects(() => act(agent("[]"), 1, INTS, bad), "CONFIG");
  act(agent("[]"), 1, INTS, "18446744073709551615");
});

test("sandbox: usedRandom, including entropy past the proxies", () => {
  const used = (source, seed = "1") => run("act", source, { seed, settings: ROOMY });
  assert.equal(used(agent("[add(x)]")).usedRandom, false);
  assert.equal(used(agent("[add(__import__('random').randrange(9))]")).usedRandom, true);
  assert.equal(used(agent("[add(__import__('random').Random().randrange(9))]")).usedRandom, true);
  const escape = agent("[add(int.from_bytes(len.__self__.__import__('os').urandom(4)))]");
  const first = used(escape, "5");
  assert.equal(first.usedRandom, true);
  assert.equal(first.calls, used(escape, "5").calls);
  assert.notEqual(first.calls, used(escape, "6").calls);
  assert.equal(used("import random\nR = random.random()\ndef agent(x):\n    return []").usedRandom, true);
});

test("sandbox: read-only module proxies and blocked builtins", () => {
  for (const src of ["import math\nmath.memo = 1\ndef agent(x):\n    return []", "import math\ndel math.pi\ndef agent(x):\n    return []",
    agent("[add(__import__('math')._ns)]")]) rejects(() => act(src));
  assert.deepEqual(ks(agent("[add(__import__('decimal').getcontext().prec)]")), [28]);
  act("import decimal\ndecimal.getcontext().prec = 5\ndef agent(x):\n    return []");
  assert.deepEqual(ks(agent("[add(__import__('decimal').getcontext().prec)]")), [28]);
  for (const src of [agent("[add(len(__import__('os').environ))]"), agent("[add(eval('1'))]"), agent("[add(id(x))]"), agent("[add(open)]")])
    rejects(() => act(src));
  assert.deepEqual(ks("from collections import Counter\nfrom math import *\nimport collections.abc\ndef agent(x):\n    return [add(Counter('aab')['a'] + isqrt(9))]\n"), [5]);
});

test("sandbox: the step budget is deterministic and except BaseException cannot swallow it", () => {
  const loop = n => `def agent(x):\n    s = 0\n    for i in range(${n}):\n        s += i\n    return [add(s)]\n`;
  const steps = run("act", loop(1000), { settings: ROOMY }).steps;
  assert.equal(steps, run("act", loop(1000), { settings: ROOMY }).steps, "steps are deterministic");
  assert.ok(steps > 2000);
  const small = { ...INTS, stepBudget: 1000, interactionComputeMs: 1000 };
  rejects(() => act(loop(1000), 1, small), "LIMIT", /Step limit exceeded/);
  assert.equal(act(loop(100), 1, small), '[["add",{"k":4950}]]');
  const swallow = "def agent(x):\n    try:\n        while True:\n            pass\n    except BaseException:\n        return [add(1)]\n";
  rejects(() => act(swallow, 1, small), "LIMIT", /Step limit/);
  for (const bad of [0, 10_000_001, 1.5]) rejects(() => act(agent("[]"), 1, { ...INTS, stepBudget: bad }), "CONFIG");
  const src = "import random, time\nfrom collections import Counter\ndef agent(x):\n    r = random.random()\n    return [add(int(r * 1e9)), add(int(time.perf_counter_ns())), add(len(repr(object())))]\n";
  assert.deepEqual(run("act", src, { seed: "99", settings: ROOMY }), run("act", src, { seed: "99", settings: ROOMY }));
});

// --- test_astbits.py: ast-bits-v1 against grid-lab's published test vectors.
const LITERAL = new Set(["one_paint", "same_move_raw", "same_move_area", "renamed"]);
const PAINT_ROW_2_RED = ["paint", { colour: 0, kind: "line", region: [0, 2] }];
const inspectGridlab = (source, scheme) => engine.run({ mode: "inspect", source, settings: GRIDLAB, pricingScheme: scheme });
const close = (a, b, delta, message) => assert.ok(Math.abs(a - b) <= delta, `${message}: ${a} vs ${b}`);

test("astbits: the 17 grid-lab programs under both schemes", () => {
  assert.equal(Object.keys(VECTORS.programs).length, 17);
  for (const scheme of ["corpus", "uniform"]) {
    for (const [name, vector] of Object.entries(VECTORS.programs)) {
      const got = inspectGridlab(vector.source, scheme), want = vector[scheme];
      for (const part of ["structure", "names", "literals"]) close(got.parts[part], want[part], 1e-5, `${scheme} ${name} ${part}`);
      assert.equal(got.astBytes, vector.ast_bytes);
      if (LITERAL.has(name)) {
        assert.deepEqual(got.literalMoves, [PAINT_ROW_2_RED]);
        close(got.parts.moveFlags, 0, 1e-12, name);
        assert.ok(want.moves > 3);   // grid-lab's moves = flag + log2(#available) + D: the host's part
      } else {
        assert.deepEqual(got.literalMoves, []);
        close(got.parts.moveFlags, want.moves, 1e-5, `${name} moves`);
        close(got.cost, want.total, 1e-5, `${name} total`);
      }
    }
  }
});

test("astbits: one price per spelling, the literal-move fallback, renaming, the universal codes", () => {
  const costs = new Set([...LITERAL].map(n => inspectGridlab(VECTORS.programs[n].source, "corpus").cost.toFixed(9)));
  assert.equal(costs.size, 1);
  const user = inspectGridlab("def paint(a, c):\n    return []\ndef agent(grid):\n    return [paint_row(2, 'red')]\n", "corpus");
  assert.equal(user.literalMoves.length, 1);
  const shadowed = inspectGridlab("def paint_row(a, c):\n    return []\ndef agent(grid):\n    return [paint_row(2, 'red')]\n", "corpus");
  assert.deepEqual(shadowed.literalMoves, []);
  assert.ok(shadowed.parts.moveFlags > 0);
  assert.deepEqual(inspectGridlab("def agent(grid):\n    return [paint_row(2, 'mauve')]\n", "corpus").literalMoves, []);
  assert.ok(inspectGridlab(VECTORS.programs.one_paint.source, "corpus").literalMoveFallbackBits[0] > -Math.log2(7 / 8));
  const a = inspectGridlab("def agent(grid):\n    best = max(grid.cells)\n    return [best]\n", "corpus");
  const b = inspectGridlab("def agent(g):\n    zz = max(g.cells)\n    return [zz]\n", "corpus");
  close(a.cost, b.cost, 1e-12, "renaming");
  const gamma = Object.keys(VECTORS.codes.gamma).map(Number), strings = Object.keys(VECTORS.codes.string);
  assert.deepEqual(engine.trustedEval(`[_AB['gamma_bits'](n) for n in ${JSON.stringify(gamma)}]`), Object.values(VECTORS.codes.gamma));
  engine.trustedEval(`[_AB['string_bits'](s) for s in json.loads(${JSON.stringify(JSON.stringify(strings))})]`)
    .forEach((bits, i) => close(bits, VECTORS.codes.string[strings[i]], 1e-9, strings[i]));
});

// --- New with the V8 host.
test("wasi: after bootstrap only the virtual clock and the seeded entropy answer", () => {
  const wasi = new Wasi({ files: new Map([["/lib/python3.15/os.py", new Uint8Array(4)]]), args: [], env: [] });
  const module = new WebAssembly.Module(files.get("python-reactor.wasm"));
  const table = wasi.imports(module).wasi_snapshot_preview1;
  wasi.memory = new WebAssembly.Memory({ initial: 1 });
  wasi.mode = "guest";
  wasi.resetAct(5n);
  const view = new DataView(wasi.memory.buffer);
  assert.equal(table.clock_time_get(0, 0n, 64), 0);
  assert.equal(view.getBigUint64(64, true), EPOCH_NS + 1000n);
  assert.equal(table.clock_time_get(1, 0n, 64), 0);
  assert.equal(view.getBigUint64(64, true), EPOCH_NS + 2000n, "every clock id is the same virtual clock");
  assert.equal(table.random_get(128, 16), 0);
  assert.equal(table.random_get(65535 * 2, 1), 21, "out-of-bounds pointers are EFAULT");
  assert.equal(table.random_get(0, 70000), 28);
  const denied = Object.keys(table).filter(name => !["clock_time_get", "clock_res_get", "random_get", "proc_exit"].includes(name));
  assert.equal(denied.length, WebAssembly.Module.imports(module).length - 4);
  assert.ok(denied.length >= 35, `${denied.length} denied imports`);
  for (const name of denied) assert.equal(table[name](3, 0, 0, 0, 0, 0n, 0n, 0, 0), 76, `${name} is ENOTCAPABLE`);
  assert.throws(() => table.proc_exit(0), /capability denied/);
});

test("bundle: the pinned SHA-256 is required", () => {
  assert.equal(unpack(bundleBytes).size, files.size);
  const forged = pack(new Map([...files].map(([path, data]) => [path, path === "guest/sandbox_guest.py" ? new TextEncoder().encode("pass\n") : data])));
  assert.throws(() => unpack(forged), /checksum mismatch/);
  assert.throws(() => unpack(bundleBytes, "0".repeat(64)), /checksum mismatch/);
  assert.match(PYTHON_BUNDLE_SHA256, /^[0-9a-f]{64}$/);
});

test("pool: the worker watchdog terminates native work past its wall; the next act starts from the snapshot", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "python", workers: 2, assets: bundleBytes });
  try {
    await r.warm(1);
    for (const source of [agent("[add(sum(range(10**9)))]"), agent("[add(len(str(10**200000)))]"),
      "sum(iter(lambda: 1, 0))\ndef agent(x):\n    return []", agent("[add(sum(iter(lambda: 1, 0)))]")]) {
      await r.inspect(source, INTS);
      const start = performance.now();
      await assert.rejects(r.act(source, 1, INTS, "1"), e => e.code === "LIMIT" && /5 ms compute budget/.test(e.message), source);
      assert.ok(performance.now() - start < 1500, "terminated promptly");
      assert.equal((await r.act(agent("[add(x)]"), 7, INTS, "1")).calls, '[["add",{"k":7}]]');
    }
    // Restarted workers come from the shared snapshot (no second bootstrap) and stay deterministic.
    const src = "import random\ndef agent(x):\n    return [add(random.getrandbits(40))]\n";
    const results = await Promise.all(Array.from({ length: 6 }, () => r.act(src, 1, ROOMY, "77")));
    assert.equal(new Set(results.map(x => x.calls)).size, 1);
    assert.equal(r.slots.length, 2);
  } finally { r.close(); }
});

test("pool: the bootstrapping worker is retired; the pool's worker starts from its snapshot", { timeout: 120000 }, async () => {
  // A source of its own (a copy of the bytes), so this pool bootstraps rather than reusing another test's snapshot.
  const r = new GameRuntime({ language: "python", workers: 1, assets: bundleBytes.slice() });
  try {
    await r.warm();
    const [slot] = r.slots;
    assert.ok(slot.ready && slot.retired && slot.worker !== slot.retired, "a second worker, started from the snapshot, serves");
    assert.equal((await r.act(agent("[add(x * 3)]"), 5, INTS, "1")).calls, '[["add",{"k":15}]]');
    assert.equal(r.slots.length, 1);
  } finally { r.close(); }
});

test("pool: inline execution, asset loaders and missing or forged bundles", { timeout: 120000 }, async () => {
  const inline = new GameRuntime({ language: "python", execution: "inline", assets: async () => bundleBytes });
  try {
    assert.equal((await inline.act(agent("[add(x + 1)]"), 1, ROOMY, "1")).calls, '[["add",{"k":2}]]');
    const [a, b] = await Promise.all([inline.act(agent("[add(x)]"), 3, ROOMY, "1"), inline.act(agent("[add(x)]"), 4, ROOMY, "1")]);
    assert.deepEqual([a.calls, b.calls], ['[["add",{"k":3}]]', '[["add",{"k":4}]]']);
    await assert.rejects(inline.act("def agent(x):\n    while True:\n        pass\n", 1, { ...ROOMY, stepBudget: 1000 }, "1"), { code: "LIMIT" });
  } finally { inline.close(); }
  const host = await loadPythonRuntime(bundleBytes);
  assert.equal(host, await loadPythonRuntime(bundleBytes), "loaded once per source");
  const missing = new GameRuntime({ language: "python", assets: "/not/a/bundle" });
  await assert.rejects(missing.act(agent("[]"), 1, INTS, "1"), { code: "UNAVAILABLE" });
  missing.close();
  const forged = new GameRuntime({ language: "python", assets: async () => new Uint8Array(100) });
  await assert.rejects(forged.inspect(agent("[]"), INTS), e => e.code === "UNAVAILABLE" && /checksum/.test(e.message));
  forged.close();
});
