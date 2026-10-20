import { test } from "node:test";
import assert from "node:assert/strict";
import { GameRuntime } from "../index.mjs";
const ints = { objectType: "Int", intMin: -1000, intMax: 1000, stringMaxLength: 256 };
const strings = { ...ints, objectType: "string" };
for (const language of ["python", "typescript"]) {
  test(language + " contract and hostile fixtures", { timeout: 120000 }, async () => {
    const r = new GameRuntime({ language });
    const py = language === "python";
    const fn = py ? "lambda x: x + 1" : "(x: number) => x + 1";
    try {
      const priced = await r.inspect(fn, ints);
      assert.equal(priced.cost, 9); // language-specific ASTs happen to agree for this fixture
      for (const [source, cost] of py ? [
        ["lambda x: x", 6], ["lambda x: 128", 6], ['lambda x: "é"', 6],
      ] : [
        ["(x:number)=>x", 6], ["(x:number)=>128", 7], ['(x:string)=>"é"', 7],
      ]) assert.deepEqual(await r.inspect(source, !py && source.includes('"é"') ? strings : ints), { cost });
      assert.deepEqual(await r.validate(fn, [1, 2], ints), { cost: priced.cost, outputs: [2, 3] });
      assert.deepEqual(await r.execute(py ? "(lambda n: lambda x: x+n)(3)"
        : "((n: number) => (x: number) => x+n)(3)", 2, ints), { value: 5 });
      const reverse = py ? "lambda x: x[::-1]" : "(x: string) => x.split('').reverse().join('')";
      assert.deepEqual(await r.execute(reverse, "a".repeat(200), strings), { value: "a".repeat(200) });
      // CPython 3.14+ folds constant slices into slice objects; caching them needs marshal v5.
      const slice = py ? 'lambda x: x[1:] + x[:2]' : "(x: string) => x.slice(1) + x.slice(0, 2)";
      assert.deepEqual(await r.execute(slice, "hello", strings), { value: "ellohe" });
      const state = py ? "(lambda a: lambda x: (a.append(x), len(a))[1])([])"
        : "(() => { let n=0; return (x:number) => ++n; })()";
      for (let i = 0; i < 2; i++) assert.deepEqual(await r.execute(state, 0, ints), { value: 1 });
      await r.inspect(py ? "(sum(iter(lambda: 1, 0)), lambda x: x)[1]"
        : "(() => { while(true) {} return (x:number) => x; })()", ints);
      for (const source of py ? [
        "lambda x: open('/etc/passwd').read()", "lambda x: __import__('socket').socket()",
        `lambda x: (print('{"cost":0}'), x)[1]`, "lambda x: True",
        "lambda x: 1001", "lambda x: 'é'", "lambda x: sum(iter(lambda: 1, 0))",
        "lambda x: __import__('re').match('(a+)+$', 'a'*40+'!')",
      ] : [
        "(x:number) => process.env", "(x:number) => fetch('https://example.com')",
        "(x:number) => true", "(x:number) => 1001",
        "(x:number) => { while(true) {} }",
        "(x:number) => /(a+)+$/.test('a'.repeat(40)+'!') ? x : 0",
        "(x:number) => ({value:x,cost:0})",
      ]) await assert.rejects(r.execute(source, 1, ints));
      await assert.rejects(r.inspect("(".repeat(16000), ints));
      await assert.rejects(r.inspect(" ".repeat(16385), ints));
      await assert.rejects(r.execute(fn, 1001, ints), { code: "DOMAIN" });
      for (const source of py ? ["lambda x: 'é'", "lambda x: 'a'*9000"]
        : ['(x:string)=>"é"', '(x:string)=>"a".repeat(9000)'])
        await assert.rejects(r.execute(source, "", strings));
      for (const source of py ? [
        "lambda x: len(bytearray(200*1024*1024))",
        "(lambda f: lambda x: f(f))(lambda f: f(f))",
      ] : [
        '(x:number)=>"a".repeat(100*1024*1024).length',
        "(() => { const f = ():number => f(); return (x:number) => f(); })()",
      ]) await assert.rejects(r.execute(source, 1, ints));
      if (py) {
        const before = Date.now() / 1000;
        const { value: now } = await r.execute("lambda x: str(__import__('time').time())", "", strings);
        assert.ok(Number(now) >= before - 1 && Number(now) <= Date.now() / 1000 + 1);
        const draws = [];
        for (let i = 0; i < 3; i++) draws.push((await r.execute(
          "lambda x: __import__('os').urandom(16).hex()", "", strings)).value);
        assert.ok(new Set(draws).size > 1, "fresh guests must receive real entropy");
        for (const source of [
          "lambda x: int(__import__('os').stat('/lib/python3.15/os.py').st_mtime)",
          "lambda x: __import__('os').stat('/lib/python3.15/os.py').st_ino",
          "lambda x: open('/lib/python3.15/os.py').read()",
          "lambda x: __import__('os').listdir('/lib')",
        ]) await assert.rejects(r.execute(source, 1, ints), { code: "EXECUTION" },
          `Guest filesystem capabilities must be denied: ${source}`);
        assert.deepEqual(await r.execute("lambda x: __import__('math').isqrt(x)", 81, ints),
          { value: 9 });
        const randomDraws = [];
        for (let i = 0; i < 4; i++) randomDraws.push((await r.execute(
          "lambda x: str(__import__('random').random())", "", strings)).value);
        assert.ok(randomDraws.every(value => Number(value) >= 0 && Number(value) < 1));
        assert.ok(new Set(randomDraws).size > 1, "snapshot restoration must not repeat PRNG state");
      }
      assert.deepEqual(await r.execute(fn, 1, ints), { value: 2 });
    } finally { r.close(); }
  });
}
test("typescript room-contextual T => T contract and wrapper-free costs", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "typescript" });
  try {
    // These are the exact unannotated expressions advertised to players.
    for (const settings of [ints, strings]) {
      assert.deepEqual(await r.inspect("(x)=>x", settings), { cost: 5 });
      assert.deepEqual(await r.inspect("(x)=> /* identity */ x", settings), { cost: 5 });
      const typed = settings.objectType === "Int" ? "(x: number)=>x" : "(x: string)=>x";
      assert.deepEqual(await r.inspect(typed, settings), { cost: 6 });
      for (const input of settings.objectType === "Int" ? [-37, 0, 37] : ["", "ASCII\0\n", "hello"]) {
        assert.deepEqual(await r.execute("(x)=>x", input, settings), { value: input });
        assert.deepEqual(await r.execute(typed, input, settings), { value: input });
      }
    }
    assert.deepEqual(await r.inspect("(x)=>x+1", ints), { cost: 8 });
    assert.deepEqual(await r.validate("(x)=>x+1", [-37, 0, 37], ints),
      { cost: 8, outputs: [-36, 1, 38] });
    assert.deepEqual(await r.inspect("(x: number)=>x+1", ints), { cost: 9 });
    assert.deepEqual(await r.execute("(x: number)=>x+1", 1, ints), { value: 2 });
    for (const [source, settings] of [
      ['(x)=>"wrong"', ints], ["(x)=>1", strings], ["(x)=>true", ints],
      ["(x: string)=>x", ints], ["(x: number)=>x", strings],
      ["(x)=> { const untyped = (y)=>y; return untyped(x); }", ints],
    ]) await assert.rejects(r.inspect(source, settings), { code: "COMPILE" });
    // Type assertions cannot bypass primitive or configured runtime bounds.
    for (const [source, input, settings] of [
      ['(x)=>"wrong" as any', 0, ints],
      ["(x)=>1001", 0, ints], ["(x)=>0.5", 0, ints], ["(x)=>NaN", 0, ints],
      ['(x)=>"é"', "", strings], ['(x)=>"a".repeat(257)', "", strings],
    ]) await assert.rejects(r.execute(source, input, settings), { code: "DOMAIN" });
  } finally { r.close(); }
});

test("typescript host time/entropy, guest CPU budgets and fresh batched contexts", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "typescript", deadlineMs: 100 });
  try {
    // Cold compilation is not charged to the separate execution hard wall.
    const before = Date.now();
    const { value: now } = await r.execute("(x)=>String(Date.now())", "", strings);
    assert.ok(Number(now) >= before && Number(now) <= Date.now());
    assert.equal(r.slots[0].executionWallMs, 50);
    await r.execute("(x)=>x", 0, { ...ints, interactionComputeMs: 20 });
    assert.equal(r.slots[0].executionWallMs, 100, "Explicit deadline caps the wall backstop");
    const { value: date } = await r.execute("(x)=>String(new Date().getTime())", "", strings);
    assert.ok(Number(date) >= before && Number(date) <= Date.now());
    const { values: draws } = await r.executeBatch("(x)=>String(Math.random())", ["", "", "", ""], strings);
    assert.ok(draws.every(draw => Number(draw) >= 0 && Number(draw) < 1));
    assert.ok(new Set(draws).size > 1);
    for (const callback of ["Date.now", "Math.random"]) {
      assert.deepEqual(await r.execute(
        `(x)=>${callback}.constructor("return typeof process + ':' + typeof require + ':' + typeof fetch")()`,
        "", strings), { value: "undefined:undefined:undefined" });
      assert.deepEqual(await r.execute(
        `(x)=>String(Object.getPrototypeOf(${callback}) === Function.prototype)`,
        "", strings), { value: "true" });
    }
    assert.deepEqual(await r.executeBatch(
      "(()=>{let n=0; return (x:number)=>x + ++n})()", [0, 1, 2], ints), { values: [1, 2, 3] });
    await assert.rejects(r.executeBatch("(x)=>x", [], ints), { code: "DOMAIN" });
    await assert.rejects(r.executeBatch("(x)=>x", Array(129).fill(0), ints), { code: "DOMAIN" });
    await assert.rejects(r.execute("(x)=>x", 0, { ...ints, interactionComputeMs: 0 }), { code: "DOMAIN" });
    for (const source of [
      "(x)=>{while(true){} return x}",
      "(()=>{while(true){} return (x:number)=>x})()",
    ]) await assert.rejects(r.execute(source, 0, ints), { code: "LIMIT" });
    // Failed guest work must not contaminate a replacement process/context.
    assert.deepEqual(await r.execute("(x)=>x", 7, ints), { value: 7 });
  } finally { r.close(); }
});

test("typescript default wall backstop bounds native initialization and CPU loops", { timeout: 30000 }, async () => {
  const r = new GameRuntime({ language: "typescript" });
  try {
    for (const source of [
      "(()=>{ /(a+)+$/.test('a'.repeat(40)+'!'); return (x:number)=>x })()",
      "(x)=>{while(true){} return x}",
    ]) {
      // Compile separately so this elapsed measurement excludes cold setup.
      await r.inspect(source, ints);
      const start = performance.now();
      await assert.rejects(r.execute(source, 0, ints), { code: "LIMIT" });
      // Generous scheduling tolerance, still far below the former 4000ms wall.
      assert.ok(performance.now() - start < 1500, "Guest execution should terminate promptly");
    }
  } finally { r.close(); }
});
test("bounded admission and missing capacity", async () => {
  const r = new GameRuntime({ language: "typescript", queueLimit: 1 });
  try {
    const first = r.execute("(x:number)=>x", 1, ints);
    const second = r.execute("(x:number)=>x", 1, ints);
    await assert.rejects(r.execute("(x:number)=>x", 1, ints), { code: "CAPACITY" });
    await Promise.all([first, second]);
  } finally { r.close(); }
  const missing = new GameRuntime({ language: "python", python: "/not/a/python" });
  await assert.rejects(missing.inspect("lambda x: x", ints), { code: "UNAVAILABLE" });
  missing.close();
});

test("four lazy workers preserve fresh guests and cached domain validation", { timeout: 120000 }, async () => {
  const r = new GameRuntime({ language: "typescript", workers: 4 });
  try {
    const source = "(() => { let n=0; return (x:number) => x + ++n; })()";
    assert.deepEqual(await r.execute(source, 0, ints), { value: 1 });
    assert.equal(r.slots.length, 1);
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await Promise.all(Array.from({ length: 4 }, () => r.execute(source, 0, ints))),
        Array.from({ length: 4 }, () => ({ value: 1 })));
    }
    assert.equal(new Set(r.slots.map(slot => slot.child.pid)).size, 4);
    // A previously trusted source must still be rejected for a different T.
    await assert.rejects(r.inspect(source, strings), { code: "COMPILE" });
    // Cached compilation must never cache results or skip output-domain checks.
    await r.execute("(x)=>99", 0, ints);
    await assert.rejects(r.execute("(x)=>99", 0, { ...ints, intMax: 10 }), { code: "DOMAIN" });
    await r.inspect("(x)=>x", ints);
    await assert.rejects(r.inspect('(x)=>x); const injected = 1; ((x:number)=>x', ints),
      { code: "COMPILE" });
  } finally { r.close(); }
});
