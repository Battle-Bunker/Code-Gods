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
      const { cost } = await r.inspect(inc, ints);
      assert.equal(cost, isPy ? 15 : 14);
      // The prelude is never priced: a larger prelude leaves the cost unchanged.
      const bigger = { ...ints, prelude: { ...ints.prelude, key: "bigger",
        python: ints.prelude.python + "\nEXTRA = [1, 2, 3]\n", js: ints.prelude.js + "\nconst EXTRA = [1, 2, 3];\n",
        dts: ints.prelude.dts + "\ndeclare const EXTRA: number[];\n" } };
      assert.deepEqual(await r.inspect(inc, bigger), { cost });
      assert.deepEqual(await r.act(inc, 41, ints), { calls: add(42) });
      assert.deepEqual(await r.validate(inc, [1, 2], ints), { cost, outputs: [add(2), add(3)] });
      assert.deepEqual(await r.act(agent("[]"), 0, ints), { calls: "[]" });
      // Ordinary programs: helpers, constants, several calls.
      const program = isPy
        ? "import math\nSTEP = 3\ndef helper(n):\n    return n * STEP\ndef agent(grid):\n    return [add(helper(grid)), add(math.isqrt(81))]\n"
        : "const STEP = 3;\nfunction helper(n: number): number { return n * STEP; }\nfunction agent(grid: number) {\n  return [add(helper(grid)), add(Math.sqrt(81))];\n}\n";
      assert.deepEqual(JSON.parse((await r.act(program, 2, ints)).calls), [["add", { k: 6 }], ["add", { k: 9 }]]);
      // Wire inputs: safe integers and bounded ASCII strings, nothing else.
      assert.deepEqual(await r.act(agent("[add(x)]"), 2 ** 53 - 1, ints), { calls: add(2 ** 53 - 1) });
      const len = isPy ? py("[add(len(x))]") : ts("[add(x.length)]");
      assert.deepEqual(await r.act(len, "a\0\n".repeat(80), strings), { calls: add(240) });
      for (const input of [2 ** 53, 0.5, NaN, "é", "a".repeat(257), null, true])
        await assert.rejects(r.act(len, input, strings), { code: "DOMAIN" });
      // Grammar errors name the mistake and its position.
      await assert.rejects(r.inspect(isPy ? "def agent(x):\n    return [add(x)" : "function agent(x) { return [add(x.foo)]; }", ints),
        e => e.code === "COMPILE" && /line \d+, column \d+\)\n.*\n *\^/.test(e.message) && (isPy ? /never closed/ : /foo/).test(e.message));
      for (const source of isPy
        ? ["lambda x: x", "def helper(x):\n    return []", "def agent(a, b):\n    return []", "async def agent(x):\n    return []"]
        : ["(x: number) => []", "function helper(x: number) { return []; }", "function agent(a: number, b: number) { return []; }",
          "function agent(x) { return [x]; }", "function agent(x: string) { return []; }",
          "import x from 'y';\nfunction agent(x) { return []; }", "export function agent(x) { return []; }",
          "function agent(x) { return []; }\nfunction agent(x) { return []; }",
          "async function agent(x) { return []; }",
          "/// <reference path=\"/etc/passwd\" />\nfunction agent(x) { return []; }"])
        await assert.rejects(r.inspect(source, ints), { code: "COMPILE" }, source);
      await assert.rejects(r.inspect("(".repeat(16000), ints));
      await assert.rejects(r.inspect(" ".repeat(16385), ints), { code: "COMPILE" });
      // Inspection never evaluates; the user's module is inside the budget at act time.
      const loopModule = isPy ? "while True:\n    pass\ndef agent(x):\n    return []\n"
        : "while (true) {}\nfunction agent(x) { return []; }\n";
      assert.ok((await r.inspect(loopModule, ints)).cost > 0);
      await assert.rejects(r.act(loopModule, 1, ints), e => e.code === "LIMIT" && /5 ms compute budget/.test(e.message));
      await assert.rejects(r.act(isPy ? py("[add(sum(range(10**8)))]")
        : ts("(() => { let s = 0; for (let i = 0; i < 1e9; i++) s += i; return [add(s)]; })()"), 1, ints),
      e => e.code === "LIMIT" && /^Time limit exceeded: .* 5 ms compute budget/.test(e.message));
      // Runtime errors are explained.
      await assert.rejects(r.act(isPy ? py("[add(x // 0)]") : ts("(() => { throw new RangeError('nope'); })() as never[]"), 1, ints),
        e => e.code === "EXECUTION" && (isPy ? /ZeroDivisionError: .* \(line 2\)/ : /RangeError: nope/).test(e.message));
      // Fresh guest state per act.
      const state = isPy ? "import builtins\nbuiltins.n = getattr(builtins, 'n', 0) + 1\ndef agent(x):\n    return [add(builtins.n)]\n"
        : "(globalThis as any).n = ((globalThis as any).n ?? 0) + 1;\nfunction agent(x) { return [add((globalThis as any).n)]; }\n";
      for (let i = 0; i < 3; i++) assert.deepEqual(await r.act(state, 0, ints), { calls: add(1) });
      // A guest that monkeypatches the encoder (or what it uses) only produces some string.
      const patched = isPy ? "def __encode_calls(c):\n    return 'not json'\ndef agent(x):\n    return []\n"
        : "JSON.stringify = () => 'not json';\n(globalThis as any).__encode_calls = () => 'still not';\nfunction agent(x) { return []; }\n";
      assert.deepEqual(await r.act(patched, 0, ints), { calls: isPy ? "not json" : "[]" });
      const shadow = isPy ? "def add(k):\n    return {'__m': 'forged', 'k': k}\ndef agent(x):\n    return [add(x)]\n"
        : "function agent(x) { return [{ __m: 'forged', k: x }]; }\n";
      assert.deepEqual(await r.act(shadow, 3, ints), { calls: JSON.stringify([["forged", { k: 3 }]]) });
      // Output boundary: exact strings only; oversized → LIMIT; non-string → DOMAIN.
      await assert.rejects(r.act(isPy ? py("[add('a' * 70000)]") : "function agent(x) { return [{ __m: 'add', k: 'a'.repeat(70000) }]; }",
        1, ints), { code: "LIMIT" });
      if (isPy) {
        const encoder = body => `def __encode_calls(c):\n    return ${body}\ndef agent(x):\n    return []\n`;
        for (const body of ["None", "b'[]'", "1", "type('S', (str,), {})('[]')", "'[\"é\"]'"])
          await assert.rejects(r.act(encoder(body), 1, ints), { code: "DOMAIN" }, body);
        await assert.rejects(r.act(encoder("'[' * 65537"), 1, ints), { code: "LIMIT" });
      }
      if (!isPy) {
        // A leaky encoder that returns whatever the agent built: only exact strings cross.
        const leaky = { ...ints, prelude: { ...ints.prelude, key: "leaky",
          js: ints.prelude.js.replace(/function __encode_calls[^]*$/, "function __encode_calls(calls) { return calls; }\n"),
          dts: ints.prelude.dts.replace(/declare function __encode_calls.*/, "declare function __encode_calls(calls: unknown): unknown;") } };
        const returning = body => `function agent(x): unknown { return ${body}; }\n`;
        for (const body of ["1", "undefined", "new String('[]')", "({ toString: () => '[]' })", "Symbol('x')", "['[]']"])
          await assert.rejects(r.act(returning(body), 1, leaky), { code: "DOMAIN" }, body);
        await assert.rejects(r.act(returning("'['.repeat(65537)"), 1, leaky), { code: "LIMIT" });
        await assert.rejects(r.act(returning("'[\"é\"]'"), 1, leaky), { code: "DOMAIN" });
        assert.equal((await r.act(returning("'['.repeat(65536)"), 1, leaky)).calls.length, 65536);
        // Embedded NULs cross exactly (no truncation to a valid prefix).
        assert.deepEqual(await r.act(returning("'[]\\0garbage'"), 1, leaky), { calls: "[]\0garbage" });
      }
      // Capabilities.
      for (const source of isPy ? [
        py("open('/etc/passwd').read()"), py("__import__('socket').socket()"),
        py(`(print('[["add",{"k":0}]]'), [])[1]`),
        py("__import__('re').match('(a+)+$', 'a'*40+'!')"),
        py("len(bytearray(200*1024*1024))"),
        "def f(n):\n    return f(n)\ndef agent(x):\n    return [add(f(x))]\n",
      ] : [
        ts("[add((globalThis as any).process.env)]"), ts("[add((globalThis as any).fetch('https://example.com'))]"),
        ts("[add(/(a+)+$/.test('a'.repeat(40)+'!') ? 1 : 0)]"),
        ts("[add('a'.repeat(100*1024*1024).length)]"),
        "function f(): number { return f(); }\nfunction agent(x) { return [add(f())]; }\n",
      ]) await assert.rejects(r.act(source, 1, ints), undefined, source);
      if (isPy) {
        const before = Date.now() / 1000;
        const now = JSON.parse((await r.act(py("[add(__import__('time').time())]"), 0, ints)).calls)[0][1].k;
        assert.ok(now >= before - 1 && now <= Date.now() / 1000 + 1);
        const draws = new Set();
        for (let i = 0; i < 4; i++) draws.add((await r.act(py("[add(__import__('os').urandom(16).hex())]"), 0, ints)).calls);
        assert.ok(draws.size > 1, "fresh guests must receive real entropy");
        const randoms = new Set();
        for (let i = 0; i < 4; i++) randoms.add((await r.act(py("[add(__import__('random').random())]"), 0, ints)).calls);
        assert.ok(randoms.size > 1, "snapshot restoration must not repeat PRNG state");
        for (const body of [
          "int(__import__('os').stat('/lib/python3.15/os.py').st_mtime)",
          "open('/lib/python3.15/os.py').read()",
          "__import__('os').listdir('/lib')",
        ]) await assert.rejects(r.act(py(`[add(${body})]`), 1, ints), { code: "EXECUTION" },
          `Guest filesystem capabilities must be denied: ${body}`);
      }
      // Bad settings and preludes.
      for (const settings of [
        undefined, { ...ints, prelude: undefined }, { ...ints, wireMaxLength: 1025 }, { ...ints, objectType: "" },
        { ...ints, interactionComputeMs: 0 }, { ...ints, prelude: { ...ints.prelude, key: "" } },
        { ...ints, prelude: { ...ints.prelude, js: "x".repeat(65537) } },
        { ...ints, prelude: { ...ints.prelude, dts: "\0" } },
        { objectType: "Int", intMin: 0, intMax: 10, stringMaxLength: 0 },
      ]) await assert.rejects(r.inspect(inc, settings), { code: "CONFIG" });
      const broken = { ...ints, prelude: { ...ints.prelude, key: "broken",
        python: "def __decode(:\n", js: "function __decode(", dts: ints.prelude.dts } };
      await assert.rejects(r.act(inc, 1, broken), { code: "CONFIG" });
      // Cache keys include the prelude: same source, different prelude, different result.
      const doubled = { ...ints, prelude: { ...ints.prelude, key: "doubled",
        python: ints.prelude.python + "\ndef __decode(w):\n    return 2 * w\n",
        js: ints.prelude.js.replace("return wire;", "return 2 * wire;") } };
      assert.deepEqual(await r.act(inc, 1, doubled), { calls: add(3) });
      assert.deepEqual(await r.act(inc, 1, ints), { calls: add(2) });
      assert.deepEqual(await r.act(inc, 1, ints), { calls: add(2) });
    } finally { r.close(); }
  });
}

test("typescript type checks against the prelude declarations", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "typescript" });
  try {
    // Unannotated agent parameters take the decoder's type; costs exclude any wrapper.
    assert.deepEqual(await r.inspect("function agent(x) { return []; }", ints), { cost: 8 });
    assert.deepEqual(await r.inspect("function agent(x) /* hi */ { return []; }", ints), { cost: 8 });
    assert.deepEqual(await r.inspect("function agent(x: number) { return []; }", ints), { cost: 9 });
    assert.deepEqual(await r.act("function agent(x) { return [add(x * 2)]; }", 4, ints), { calls: add(8) });
    // The object type comes from the prelude: the same source fails against another prelude.
    await assert.rejects(r.inspect("function agent(x) { return [add(x * 2)]; }", strings), { code: "COMPILE" });
    assert.deepEqual(await r.act("function agent(x) { return [add(x.length)]; }", "hello", strings), { calls: add(5) });
    await assert.rejects(r.inspect("function agent(x) { return [add(x.length)]; }", ints),
      e => e.code === "COMPILE" && /length.*\(line 1, column 35\)/s.test(e.message));
    for (const source of [
      "function agent(x) { const untyped = (y) => y; return [add(untyped(x))]; }",
      "function agent(x) { return [add('one')]; }",
      "function agent(x) { return add(x); }",
      "function agent(x) { return [nope(x)]; }",
    ]) await assert.rejects(r.inspect(source, ints), { code: "COMPILE" }, source);
    // Type assertions cannot bypass the boundary: the host still parses the string.
    assert.deepEqual(await r.act("function agent(x) { return [{ __m: 'add', k: 'wrong' }] as any; }", 0, ints),
      { calls: JSON.stringify([["add", { k: "wrong" }]]) });
    // A broken declaration file is the room's fault, not the player's.
    const badDts = { ...ints, prelude: { ...ints.prelude, key: "bad-dts", dts: "declare function __decode(: number;" } };
    await assert.rejects(r.inspect("function agent(x) { return []; }", badDts), { code: "CONFIG" });
  } finally { r.close(); }
});

test("typescript host time/entropy, guest CPU budgets and fresh contexts", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "typescript", deadlineMs: 100 });
  const k = async (body, settings = ints) => JSON.parse((await r.act(ts(`[add(${body})]`), 0, settings).catch(e => {
    e.message += ` (in agent body ${body})`; throw e;
  })).calls)[0][1].k;
  try {
    // Cold compilation is not charged to the separate execution hard wall.
    const before = Date.now();
    const now = await k("Date.now()");
    assert.ok(now >= before && now <= Date.now());
    assert.equal(r.slots[0].executionWallMs, 50);
    await k("x", { ...ints, interactionComputeMs: 20 });
    assert.equal(r.slots[0].executionWallMs, 100, "Explicit deadline caps the wall backstop");
    const date = await k("new Date().getTime()");
    assert.ok(date >= before && date <= Date.now());
    const draws = [];
    for (let i = 0; i < 4; i++) draws.push(await k("Math.random()"));
    assert.ok(draws.every(draw => draw >= 0 && draw < 1));
    assert.ok(new Set(draws).size > 1);
    for (const callback of ["Date.now", "Math.random"]) {
      assert.equal(await k(`${callback}.constructor("return typeof process + ':' + typeof require + ':' + typeof fetch")().length`), 29);
      assert.equal(await k(`Object.getPrototypeOf(${callback}) === Function.prototype ? 1 : 0`), 1);
    }
    await assert.rejects(r.act(ts("[]"), 0, { ...ints, interactionComputeMs: 0 }), { code: "CONFIG" });
    for (const source of ["function agent(x) { while (true) {} return []; }", "while (true) {}\nfunction agent(x) { return []; }"])
      await assert.rejects(r.act(source, 0, ints), { code: "LIMIT" });
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
      await r.inspect(source, ints);
      const start = performance.now();
      await assert.rejects(r.act(source, 0, ints), { code: "LIMIT" });
      // Generous scheduling tolerance, still far below the former 4000ms wall.
      assert.ok(performance.now() - start < 1500, "Guest execution should terminate promptly");
    }
  } finally { r.close(); }
});

test("bounded admission and missing capacity", async () => {
  const r = new GameRuntime({ language: "typescript", queueLimit: 1 });
  const source = ts("[]");
  try {
    const first = r.act(source, 1, ints);
    const second = r.act(source, 1, ints);
    await assert.rejects(r.act(source, 1, ints), { code: "CAPACITY" });
    await Promise.all([first, second]);
  } finally { r.close(); }
  const missing = new GameRuntime({ language: "python", python: "/not/a/python" });
  await assert.rejects(missing.inspect(py("[]"), ints), { code: "UNAVAILABLE" });
  missing.close();
});

test("four lazy workers preserve fresh guests and cached checks", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "typescript", workers: 4 });
  try {
    const source = "let n = 0;\nfunction agent(x) { return [add(x + ++n)]; }\n";
    assert.deepEqual(await r.act(source, 0, ints), { calls: add(1) });
    assert.equal(r.slots.length, 1);
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await Promise.all(Array.from({ length: 4 }, () => r.act(source, 0, ints))),
        Array.from({ length: 4 }, () => ({ calls: add(1) })));
    }
    assert.equal(new Set(r.slots.map(slot => slot.child.pid)).size, 4);
    // A previously checked source must still be rejected against a different prelude.
    await assert.rejects(r.inspect(source, strings), { code: "COMPILE" });
  } finally { r.close(); }
});
