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
        ["(x:number)=>x", 6], ["(x:number)=>128", 7], ['(x:number)=>"é"', 7],
      ]) assert.deepEqual(await r.inspect(source, ints), { cost });
      assert.deepEqual(await r.validate(fn, [1, 2], ints), { cost: priced.cost, outputs: [2, 3] });
      assert.deepEqual(await r.execute(py ? "(lambda n: lambda x: x+n)(3)"
        : "((n: number) => (x: number) => x+n)(3)", 2, ints), { value: 5 });
      const reverse = py ? "lambda x: x[::-1]" : "(x: string) => x.split('').reverse().join('')";
      assert.deepEqual(await r.execute(reverse, "a".repeat(200), strings), { value: "a".repeat(200) });
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
        "(x:number) => true", "(x:number) => 1001", "(x:number) => Math.random()",
        "(x:number) => Date.now()", "(x:number) => { while(true) {} }",
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
        for (const source of [
          "lambda x: int(__import__('time').time())",
          "lambda x: int.from_bytes(__import__('os').urandom(4))",
          "lambda x: int(__import__('os').stat('/lib/python3.15/os.py').st_mtime)",
          "lambda x: __import__('os').stat('/lib/python3.15/os.py').st_ino",
        ]) assert.deepEqual(await r.execute(source, 1, ints), { value: 0 });
      }
      assert.deepEqual(await r.execute(fn, 1, ints), { value: 2 });
    } finally { r.close(); }
  });
}
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
