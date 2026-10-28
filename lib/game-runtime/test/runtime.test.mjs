import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameRuntime, GRAMMAR_IDS } from "../index.mjs";

// A fake "Int" prelude (identity decode, one `add(k)` constructor), shared with the Python tests.
const fixture = JSON.parse(readFileSync(new URL("./fixture-prelude.json", import.meta.url), "utf8"));
const ints = { ...fixture, interactionComputeMs: 5 };
const strings = { ...ints, objectType: "string", wireMaxLength: 256, prelude: { ...ints.prelude,
  key: "fixture-strings", dts: ints.prelude.dts.replace("__decode(wire: number): number", "__decode(wire: string): string") } };
const add = k => JSON.stringify([["add", { k }]]);
// act / inspect reduced to the fields most assertions compare (the calls; the ast-bytes structure size).
const act = (r, source, input, settings, seed = "1") => r.act(source, input, settings, seed).then(({ calls }) => ({ calls }));
const inspect = (r, source, settings) => r.inspect(source, settings).then(({ astBytes }) => ({ cost: astBytes }));
const py = body => `def agent(x):\n    return ${body}\n`;
const ts = (body, param = "x") => `function agent(${param}) {\n  return ${body};\n}\n`;

for (const language of ["python", "typescript"]) {
  test(language + " agent contract and hostile fixtures", { timeout: 120000 }, async () => {
    const r = new GameRuntime({ language });
    const isPy = language === "python";
    const agent = isPy ? py : ts;
    try {
      assert.equal(r.grammarId, GRAMMAR_IDS[language]);
      const inc = agent("[add(x + 1)]");
      const { cost } = await inspect(r, inc, ints);
      assert.equal(cost, isPy ? 15 : 14);
      // The prelude is never priced: a larger prelude leaves the cost unchanged.
      const bigger = { ...ints, prelude: { ...ints.prelude, key: "bigger",
        python: ints.prelude.python + "\nEXTRA = [1, 2, 3]\n", js: ints.prelude.js + "\nconst EXTRA = [1, 2, 3];\n",
        dts: ints.prelude.dts + "\ndeclare const EXTRA: number[];\n" } };
      assert.deepEqual(await inspect(r, inc, bigger), { cost });
      assert.deepEqual(await act(r, inc, 41, ints), { calls: add(42) });
      const checked = await r.validate(inc, [1, 2], ints, ["1", "2"]);
      assert.equal(checked.inspection.astBytes, cost);
      assert.deepEqual(checked.acts.map(a => a.calls), [add(2), add(3)]);
      await assert.rejects(r.validate(inc, [1, 2], ints, ["1"]), { code: "CONFIG" });
      assert.deepEqual(await act(r, agent("[]"), 0, ints), { calls: "[]" });
      // Ordinary programs: helpers, constants, several calls.
      const program = isPy
        ? "import math\nSTEP = 3\ndef helper(n):\n    return n * STEP\ndef agent(grid):\n    return [add(helper(grid)), add(math.isqrt(81))]\n"
        : "const STEP = 3;\nfunction helper(n: number): number { return n * STEP; }\nfunction agent(grid: number) {\n  return [add(helper(grid)), add(Math.sqrt(81))];\n}\n";
      assert.deepEqual(JSON.parse((await act(r, program, 2, ints)).calls), [["add", { k: 6 }], ["add", { k: 9 }]]);
      // Wire inputs: safe integers and bounded ASCII strings, nothing else.
      assert.deepEqual(await act(r, agent("[add(x)]"), 2 ** 53 - 1, ints), { calls: add(2 ** 53 - 1) });
      const len = isPy ? py("[add(len(x))]") : ts("[add(x.length)]");
      assert.deepEqual(await act(r, len, "a\0\n".repeat(80), strings), { calls: add(240) });
      for (const input of [2 ** 53, 0.5, NaN, "é", "a".repeat(257), null, true])
        await assert.rejects(act(r, len, input, strings), { code: "DOMAIN" });
      // Grammar errors name the mistake and its position.
      await assert.rejects(inspect(r, isPy ? "def agent(x):\n    return [add(x)" : "function agent(x) { return [add(x.foo)]; }", ints),
        e => e.code === "COMPILE" && /line \d+, column \d+\)\n.*\n *\^/.test(e.message) && (isPy ? /never closed/ : /foo/).test(e.message));
      for (const source of isPy
        ? ["lambda x: x", "def helper(x):\n    return []", "def agent(a, b):\n    return []", "async def agent(x):\n    return []"]
        : ["(x: number) => []", "function helper(x: number) { return []; }", "function agent(a: number, b: number) { return []; }",
          "function agent(x) { return [x]; }", "function agent(x: string) { return []; }",
          "import x from 'y';\nfunction agent(x) { return []; }", "export function agent(x) { return []; }",
          "function agent(x) { return []; }\nfunction agent(x) { return []; }",
          "async function agent(x) { return []; }",
          "/// <reference path=\"/etc/passwd\" />\nfunction agent(x) { return []; }"])
        await assert.rejects(inspect(r, source, ints), { code: "COMPILE" }, source);
      await assert.rejects(inspect(r, "(".repeat(16000), ints));
      await assert.rejects(inspect(r, " ".repeat(16385), ints), { code: "COMPILE" });
      // Inspection never evaluates; the user's module is inside the budget at act time.
      const loopModule = isPy ? "while True:\n    pass\ndef agent(x):\n    return []\n"
        : "while (true) {}\nfunction agent(x) { return []; }\n";
      assert.ok((await inspect(r, loopModule, ints)).cost > 0);
      await assert.rejects(act(r, loopModule, 1, ints), e => e.code === "LIMIT" && /Step limit|5 ms compute budget/.test(e.message));
      await assert.rejects(act(r, isPy ? py("[add(sum(range(10**8)))]")
        : ts("(() => { let s = 0; for (let i = 0; i < 1e9; i++) s += i; return [add(s)]; })()"), 1, ints),
      e => e.code === "LIMIT" && /^(Time|Step) limit exceeded: /.test(e.message));
      // Runtime errors are explained.
      await assert.rejects(act(r, isPy ? py("[add(x // 0)]") : ts("(() => { throw new RangeError('nope'); })() as never[]"), 1, ints),
        e => e.code === "EXECUTION" && (isPy ? /ZeroDivisionError: .* \(line 2\)/ : /RangeError: nope/).test(e.message));
      // Fresh guest state per act.
      const state = isPy ? "builtins = len.__self__\nbuiltins.n = getattr(builtins, 'n', 0) + 1\ndef agent(x):\n    return [add(builtins.n)]\n"
        : "(globalThis as any).n = ((globalThis as any).n ?? 0) + 1;\nfunction agent(x) { return [add((globalThis as any).n)]; }\n";
      for (let i = 0; i < 3; i++) assert.deepEqual(await act(r, state, 0, ints), { calls: add(1) });
      // A guest that monkeypatches the encoder (or what it uses) only produces some string.
      const patched = isPy ? "def __encode_calls(c):\n    return 'not json'\ndef agent(x):\n    return []\n"
        : "JSON.stringify = () => 'not json';\n(globalThis as any).__encode_calls = () => 'still not';\nfunction agent(x) { return []; }\n";
      assert.deepEqual(await act(r, patched, 0, ints), { calls: isPy ? "not json" : "[]" });
      const shadow = isPy ? "def add(k):\n    return {'__m': 'forged', 'k': k}\ndef agent(x):\n    return [add(x)]\n"
        : "function agent(x) { return [{ __m: 'forged', k: x }]; }\n";
      assert.deepEqual(await act(r, shadow, 3, ints), { calls: JSON.stringify([["forged", { k: 3 }]]) });
      // Output boundary: exact strings only; oversized → LIMIT; non-string → DOMAIN.
      await assert.rejects(act(r, isPy ? py("[add('a' * 70000)]") : "function agent(x) { return [{ __m: 'add', k: 'a'.repeat(70000) }]; }",
        1, ints), { code: "LIMIT" });
      if (isPy) {
        const encoder = body => `def __encode_calls(c):\n    return ${body}\ndef agent(x):\n    return []\n`;
        for (const body of ["None", "b'[]'", "1", "type('S', (str,), {})('[]')", "'[\"é\"]'"])
          await assert.rejects(act(r, encoder(body), 1, ints), { code: "DOMAIN" }, body);
        await assert.rejects(act(r, encoder("'[' * 65537"), 1, ints), { code: "LIMIT" });
      }
      if (!isPy) {
        // A leaky encoder that returns whatever the agent built: only exact strings cross.
        const leaky = { ...ints, prelude: { ...ints.prelude, key: "leaky",
          js: ints.prelude.js.replace(/function __encode_calls[^]*$/, "function __encode_calls(calls) { return calls; }\n"),
          dts: ints.prelude.dts.replace(/declare function __encode_calls.*/, "declare function __encode_calls(calls: unknown): unknown;") } };
        const returning = body => `function agent(x): unknown { return ${body}; }\n`;
        for (const body of ["1", "undefined", "new String('[]')", "({ toString: () => '[]' })", "Symbol('x')", "['[]']"])
          await assert.rejects(act(r, returning(body), 1, leaky), { code: "DOMAIN" }, body);
        await assert.rejects(act(r, returning("'['.repeat(65537)"), 1, leaky), { code: "LIMIT" });
        await assert.rejects(act(r, returning("'[\"é\"]'"), 1, leaky), { code: "DOMAIN" });
        assert.equal((await act(r, returning("'['.repeat(65536)"), 1, leaky)).calls.length, 65536);
        // Embedded NULs cross exactly (no truncation to a valid prefix).
        assert.deepEqual(await act(r, returning("'[]\\0garbage'"), 1, leaky), { calls: "[]\0garbage" });
      }
      // Capabilities.
      for (const source of isPy ? [
        py("open('/etc/passwd').read()"), py("__import__('socket').socket()"),
        py(`(len.__self__.print('[["add",{"k":0}]]'), [])[1]`),
        py("__import__('re').match('(a+)+$', 'a'*40+'!')"),
        py("len(bytearray(200*1024*1024))"),
        "def f(n):\n    return f(n)\ndef agent(x):\n    return [add(f(x))]\n",
      ] : [
        ts("[add((globalThis as any).process.env)]"), ts("[add((globalThis as any).fetch('https://example.com'))]"),
        ts("[add(/(a+)+$/.test('a'.repeat(40)+'!') ? 1 : 0)]"),
        ts("[add('a'.repeat(100*1024*1024).length)]"),
        "function f(): number { return f(); }\nfunction agent(x) { return [add(f())]; }\n",
      ]) await assert.rejects(act(r, source, 1, ints), undefined, source);
      if (isPy) {
        const k = async (body, seed = "1") => JSON.parse((await act(r, py(`[add(${body})]`), 0, ints, seed)).calls)[0][1].k;
        assert.equal(await k("int(__import__('time').time() * 1e6)"), 1767225600000001, "virtual clock");
        assert.equal(await k("len.__self__.__import__('os').urandom(16).hex()", "3"),
          await k("len.__self__.__import__('os').urandom(16).hex()", "3"), "seeded entropy past the proxies");
        assert.equal(await k("__import__('random').random()", "3"), await k("__import__('random').random()", "3"));
        assert.notEqual(await k("__import__('random').random()", "3"), await k("__import__('random').random()", "4"));
        for (const body of [
          "int(len.__self__.__import__('os').stat('/lib/python3.15/os.py').st_mtime)",
          "len.__self__.open('/lib/python3.15/os.py').read()",
          "len.__self__.__import__('os').listdir('/lib')",
        ]) await assert.rejects(act(r, py(`[add(${body})]`), 1, ints), { code: "EXECUTION" },
          `Guest filesystem capabilities must be denied: ${body}`);
      }
      // Bad settings and preludes.
      for (const settings of [
        undefined, { ...ints, prelude: undefined }, { ...ints, wireMaxLength: 1025 }, { ...ints, objectType: "" },
        { ...ints, interactionComputeMs: 0 }, { ...ints, prelude: { ...ints.prelude, key: "" } },
        { ...ints, prelude: { ...ints.prelude, js: "x".repeat(65537) } },
        { ...ints, prelude: { ...ints.prelude, dts: "\0" } },
        { objectType: "Int", intMin: 0, intMax: 10, stringMaxLength: 0 },
      ]) await assert.rejects(inspect(r, inc, settings), { code: "CONFIG" });
      const broken = { ...ints, prelude: { ...ints.prelude, key: "broken",
        python: "def __decode(:\n", js: "function __decode(", dts: ints.prelude.dts } };
      await assert.rejects(act(r, inc, 1, broken), { code: "CONFIG" });
      // Cache keys include the prelude: same source, different prelude, different result.
      const doubled = { ...ints, prelude: { ...ints.prelude, key: "doubled",
        python: ints.prelude.python + "\ndef __decode(w):\n    return 2 * w\n",
        js: ints.prelude.js.replace("return wire;", "return 2 * wire;") } };
      assert.deepEqual(await act(r, inc, 1, doubled), { calls: add(3) });
      assert.deepEqual(await act(r, inc, 1, ints), { calls: add(2) });
      assert.deepEqual(await act(r, inc, 1, ints), { calls: add(2) });
    } finally { r.close(); }
  });
}

test("typescript type checks against the prelude declarations", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "typescript" });
  try {
    // Unannotated agent parameters take the decoder's type; costs exclude any wrapper.
    assert.deepEqual(await inspect(r, "function agent(x) { return []; }", ints), { cost: 8 });
    assert.deepEqual(await inspect(r, "function agent(x) /* hi */ { return []; }", ints), { cost: 8 });
    assert.deepEqual(await inspect(r, "function agent(x: number) { return []; }", ints), { cost: 9 });
    assert.deepEqual(await act(r, "function agent(x) { return [add(x * 2)]; }", 4, ints), { calls: add(8) });
    // The object type comes from the prelude: the same source fails against another prelude.
    await assert.rejects(inspect(r, "function agent(x) { return [add(x * 2)]; }", strings), { code: "COMPILE" });
    assert.deepEqual(await act(r, "function agent(x) { return [add(x.length)]; }", "hello", strings), { calls: add(5) });
    await assert.rejects(inspect(r, "function agent(x) { return [add(x.length)]; }", ints),
      e => e.code === "COMPILE" && /length.*\(line 1, column 35\)/s.test(e.message));
    for (const source of [
      "function agent(x) { const untyped = (y) => y; return [add(untyped(x))]; }",
      "function agent(x) { return [add('one')]; }",
      "function agent(x) { return add(x); }",
      "function agent(x) { return [nope(x)]; }",
    ]) await assert.rejects(inspect(r, source, ints), { code: "COMPILE" }, source);
    // Type assertions cannot bypass the boundary: the host still parses the string.
    assert.deepEqual(await act(r, "function agent(x) { return [{ __m: 'add', k: 'wrong' }] as any; }", 0, ints),
      { calls: JSON.stringify([["add", { k: "wrong" }]]) });
    // A broken declaration file is the room's fault, not the player's.
    const badDts = { ...ints, prelude: { ...ints.prelude, key: "bad-dts", dts: "declare function __decode(: number;" } };
    await assert.rejects(inspect(r, "function agent(x) { return []; }", badDts), { code: "CONFIG" });
  } finally { r.close(); }
});

test("typescript virtual clock, seeded random, step and CPU budgets, fresh contexts", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "typescript", deadlineMs: 100 });
  const k = async (body, settings = ints) => JSON.parse((await act(r, ts(`[add(${body})]`), 0, settings).catch(e => {
    e.message += ` (in agent body ${body})`; throw e;
  })).calls)[0][1].k;
  try {
    // Cold compilation is not charged to the separate execution hard wall.
    assert.equal(await k("Date.now()"), 1767225600000, "virtual clock: 2026-01-01T00:00:00Z");
    assert.equal(r.slots[0].executionWallMs, 50);
    await k("x", { ...ints, interactionComputeMs: 20 });
    assert.equal(r.slots[0].executionWallMs, 100, "Explicit deadline caps the wall backstop");
    assert.equal(await k("new Date().getTime()"), 1767225600000);
    assert.equal(await k("performance.now() * 1000 + performance.now() * 1000"), 3, "1 µs per read");
    const draw = async seed => (await r.act(ts("[add(Math.random() * 2 ** 53)]"), 0, ints, seed));
    const a = await draw("12345"), b = await draw("12345"), c = await draw("12346");
    assert.equal(a.calls, b.calls);
    assert.notEqual(a.calls, c.calls);
    assert.equal(a.usedRandom, true);
    // SplitMix64(12345)'s first output (grid-lab's vector), top 53 bits.
    assert.deepEqual(JSON.parse(a.calls), [["add", { k: Number(2454886589211414944n >> 11n) }]]);
    assert.equal((await r.act(ts("[add(x)]"), 0, ints, "1")).usedRandom, false);
    for (const callback of ["Date.now", "Math.random"]) {
      assert.equal(await k(`${callback}.constructor("return typeof process + ':' + typeof require + ':' + typeof fetch")().length`), 29);
      assert.equal(await k(`Object.getPrototypeOf(${callback}) === Function.prototype ? 1 : 0`), 1);
    }
    // The deterministic step budget.
    const loop = n => `function agent(x) { let s = 0; for (let i = 0; i < ${n}; i++) s += i; return [add(s)]; }`;
    const roomy = { ...ints, interactionComputeMs: 1000 };
    const steps = (await r.act(loop(100000), 0, roomy, "1")).steps;
    assert.equal(steps, (await r.act(loop(100000), 0, roomy, "1")).steps);
    assert.ok(steps >= 100000);
    await assert.rejects(r.act(loop(100000), 0, { ...roomy, stepBudget: 50000 }, "1"), e => e.code === "LIMIT" && /Step limit/.test(e.message));
    await assert.rejects(r.act(loop(1), 0, ints, "-1"), { code: "CONFIG" });
    await assert.rejects(r.act(loop(1), 0, ints), { code: "CONFIG" });
    await assert.rejects(act(r, ts("[]"), 0, { ...ints, interactionComputeMs: 0 }), { code: "CONFIG" });
    for (const source of ["function agent(x) { while (true) {} return []; }", "while (true) {}\nfunction agent(x) { return []; }"])
      await assert.rejects(act(r, source, 0, ints), { code: "LIMIT" });
    // A slow trusted prelude and decode run outside the budget.
    const slow = { ...ints, prelude: { ...ints.prelude, key: "slow-js",
      js: ints.prelude.js + "\nlet __SPIN = 0; for (let i = 0; i < 3e6; i++) __SPIN += i;\n" } };
    assert.equal(await k("x + 1", slow), 1);
    // Failed guest work must not contaminate a replacement process/context.
    assert.equal(await k("x + 7"), 7);
  } finally { r.close(); }
});

test("typescript default wall backstop bounds native work and CPU loops", { timeout: 30000 }, async () => {
  const r = new GameRuntime({ language: "typescript" });
  try {
    for (const source of [
      "/(a+)+$/.test('a'.repeat(40)+'!');\nfunction agent(x) { return []; }",
      "function agent(x) { while (true) {} return []; }",
    ]) {
      // Compile separately so this elapsed measurement excludes cold setup.
      await inspect(r, source, ints);
      const start = performance.now();
      await assert.rejects(act(r, source, 0, ints), { code: "LIMIT" });
      // Generous scheduling tolerance, still far below the former 4000ms wall.
      assert.ok(performance.now() - start < 1500, "Guest execution should terminate promptly");
    }
  } finally { r.close(); }
});

test("bounded admission and missing capacity", async () => {
  const r = new GameRuntime({ language: "typescript", queueLimit: 1 });
  const source = ts("[]");
  try {
    const first = act(r, source, 1, ints);
    const second = act(r, source, 1, ints);
    await assert.rejects(act(r, source, 1, ints), { code: "CAPACITY" });
    await Promise.all([first, second]);
  } finally { r.close(); }
  const missing = new GameRuntime({ language: "python", assets: "/not/a/bundle" });
  await assert.rejects(missing.inspect(py("[]"), ints), { code: "UNAVAILABLE" });
  missing.close();
});

test("four lazy workers preserve fresh guests and cached checks", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "typescript", workers: 4 });
  try {
    const source = "let n = 0;\nfunction agent(x) { return [add(x + ++n)]; }\n";
    assert.deepEqual(await act(r, source, 0, ints), { calls: add(1) });
    assert.equal(r.slots.length, 1);
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await Promise.all(Array.from({ length: 4 }, () => act(r, source, 0, ints))),
        Array.from({ length: 4 }, () => ({ calls: add(1) })));
    }
    assert.equal(new Set(r.slots.map(slot => slot.worker.threadId)).size, 4);
    // A previously checked source must still be rejected against a different prelude.
    await assert.rejects(inspect(r, source, strings), { code: "COMPILE" });
  } finally { r.close(); }
});

test("typescript inline execution: same results, deterministic bounds, no hard wall", { timeout: 120000 }, async () => {
  // Inline runs on the calling thread: no hard wall, so only the step budget and the CPU checks bound an
  // act (a catastrophic regex inside QuickJS is not interrupted; worker mode exists for that).
  const inline = new GameRuntime({ language: "typescript", execution: "inline" });
  const worker = new GameRuntime({ language: "typescript" });
  try {
    const roomy = { ...ints, interactionComputeMs: 1000 };
    for (const source of [ts("[add(x + 1)]"), ts("[add(Math.floor(Math.random() * 1e6) + Date.now() % 1000)]"),
      "const STEP = 3;\nfunction agent(x: number) { let s = 0; for (let i = 0; i < 20000; i++) s += i % STEP; return [add(s + x)]; }\n"]) {
      assert.deepEqual(await inline.inspect(source, roomy), await worker.inspect(source, roomy));
      assert.deepEqual(await inline.act(source, 5, roomy, "9"), await worker.act(source, 5, roomy, "9"));
    }
    await assert.rejects(inline.act("while (true) {}\nfunction agent(x) { return []; }\n", 0, roomy, "1"),
      e => e.code === "LIMIT" && /Step limit/.test(e.message));
    await assert.rejects(inline.act(ts("(() => { let s = 0; for (let i = 0; i < 1e9; i++) s += i; return [add(s)]; })()"), 0, ints, "1"),
      e => e.code === "LIMIT" && /^(Time|Step) limit exceeded: /.test(e.message));
    assert.equal((await inline.act(ts("[add(x)]"), 3, ints, "1")).calls, add(3));
  } finally { inline.close(); worker.close(); }
});
