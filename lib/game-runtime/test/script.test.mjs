// Script mode (python-script-v1, typescript-script-v1): `main(data)` over host-supplied JSON, a CPU budget in
// seconds with a hard wall, JSON out plus captured text, the agents' sandbox and determinism.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameRuntime, SCRIPT_LIMITS, SCRIPT_GRAMMAR_IDS } from "../index.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixture-prelude.json", import.meta.url), "utf8"));
const objects = Array.from({ length: 80 }, (_, i) => ({ id: `o${i}`, mine: (i * 37) % 101, theirs: [(i * 13) % 50, (i * 29) % 70] }));
// Expected by hand from the definition: score = mine − mean(theirs), top 5 by score, ties by id order.
const expectedTop = objects.map(o => ({ id: o.id, score: o.mine - (o.theirs[0] + o.theirs[1]) / 2 }))
  .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)).slice(0, 5);

const SCRIPTS = {
  python: {
    rank: "def main(data):\n    rows = [{'id': o['id'], 'score': o['mine'] - sum(o['theirs']) / len(o['theirs'])} for o in data['objects']]\n"
      + "    rows.sort(key=lambda r: (-r['score'], r['id']))\n    print('ranked', len(rows))\n    return rows[:5]\n",
    random: "import random, time\ndef main(data):\n    return {'r': [random.random() for _ in range(3)], 't': time.time()}\n",
    syntax: "def main(data):\n    return [1,\n",
    nomain: "x = 1\n",
    raises: "def main(data):\n    return 1 // 0\n",
    loop: "def main(data):\n    while True:\n        pass\n",
    memory: "def main(data):\n    x = []\n    while True:\n        x.append(' ' * 10**6)\n",
    bigResult: `def main(data):\n    return 'x' * ${SCRIPT_LIMITS.resultBytes}\n`,
    chatty: "def main(data):\n    for i in range(100000):\n        print('line', i)\n    return 1\n",
    notJson: "def main(data):\n    return {1, 2}\n",
    nan: "def main(data):\n    return [float('nan'), float('inf'), 1.5]\n",
    sandbox: "def main(data):\n    out = []\n    for name in ['os', 'sys', 'subprocess', 'socket']:\n        try:\n            __import__(name)\n            out.append(name)\n        except ImportError:\n            pass\n"
      + "    try:\n        open('/etc/passwd')\n        out.append('open')\n    except NameError:\n        pass\n    import statistics, bisect, collections, math, itertools, functools, json, re\n"
      + "    return {'escaped': out, 'corr': statistics.correlation([1, 2, 3], [2, 4, 7])}\n",
    state: "import json\nb = len.__self__\nb.n = getattr(b, 'n', 0) + 1\ndef main(data):\n    return b.n\n",
    echo: "def main(data):\n    return data\n",
  },
  typescript: {
    rank: "type O = { id: string; mine: number; theirs: number[] };\nfunction main(data: { objects: O[] }) {\n"
      + "  const rows = data.objects.map(o => ({ id: o.id, score: o.mine - o.theirs.reduce((a, b) => a + b, 0) / o.theirs.length }));\n"
      + "  rows.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));\n  console.log('ranked', rows.length);\n  return rows.slice(0, 5);\n}\n",
    random: "function main(data: unknown) {\n  return { r: [Math.random(), Math.random(), Math.random()], t: Date.now() / 1000 };\n}\n",
    syntax: "function main(data) {\n  return [1,\n",
    nomain: "const x = 1;\n",
    raises: "function main(data: unknown): number {\n  throw new RangeError('nope');\n}\n",
    loop: "function main(data: unknown) {\n  while (true) {}\n}\n",
    memory: "function main(data: unknown) {\n  return 'y'.repeat(2 ** 29).length;\n}\n",
    bigResult: `function main(data: unknown) {\n  return 'x'.repeat(${SCRIPT_LIMITS.resultBytes});\n}\n`,
    chatty: "function main(data: unknown) {\n  for (let i = 0; i < 100000; i++) console.log('line', i);\n  return 1;\n}\n",
    notJson: "function main(data: unknown) {\n  return { f: () => 1, b: 10n };\n}\n",
    nan: "function main(data: unknown) {\n  return [NaN, Infinity, 1.5];\n}\n",
    sandbox: "declare const require: any, process: any, fetch: any;\nfunction main(data: unknown) {\n"
      + "  return { escaped: [typeof require, typeof process, typeof fetch].filter(t => t !== 'undefined'), corr: 1 };\n}\n",
    state: "(globalThis as any).n = ((globalThis as any).n ?? 0) + 1;\nconst main = (data: unknown) => (globalThis as any).n;\n",
    echo: "const main = (data: unknown) => data;\n",
  },
};

for (const language of ["python", "typescript"]) {
  const S = SCRIPTS[language];
  test(`${language} script: main(data), JSON out, captured text, determinism`, { timeout: 120000 }, async () => {
    const r = new GameRuntime({ language });
    try {
      assert.equal(SCRIPT_GRAMMAR_IDS[language], `${language}-script-v1`);
      const ranked = await r.script(S.rank, JSON.stringify({ objects }), { seed: "1" });
      assert.deepEqual(JSON.parse(ranked.result), expectedTop);
      assert.equal(ranked.output, "ranked 80\n");
      assert.equal(ranked.outputTruncated, false);
      assert.equal(ranked.usedRandom, false);
      assert.ok(ranked.cpuMs >= 0 && ranked.cpuMs < SCRIPT_LIMITS.cpuMsDefault);
      // Unicode and nesting survive the round trip.
      const data = { s: "héllo ✓", n: [1, -2.5, null, true], o: { k: [[]] } };
      assert.deepEqual(JSON.parse((await r.script(S.echo, JSON.stringify(data))).result), data);
      // Seeded randomness and the virtual clock: same seed, same result; another seed differs.
      const a = await r.script(S.random, "{}", { seed: "7" }), b = await r.script(S.random, "{}", { seed: "7" });
      const c = await r.script(S.random, "{}", { seed: "8" });
      assert.equal(a.result, b.result);
      assert.notEqual(a.result, c.result);
      assert.equal(a.usedRandom, true);
      const { t } = JSON.parse(a.result);
      assert.ok(t >= 1767225600 && t < 1767225601, `virtual clock ${t}`);
      // Non-finite numbers become null (JSON has none).
      assert.deepEqual(JSON.parse((await r.script(S.nan, "{}")).result), [null, null, 1.5]);
      // A fresh guest every run.
      for (let i = 0; i < 3; i++) assert.equal((await r.script(S.state, "{}")).result, "1");
      // No network, files, processes or host objects.
      const box = JSON.parse((await r.script(S.sandbox, "{}")).result);
      assert.deepEqual(box.escaped, []);
      assert.ok(Math.abs(box.corr - 0.9933992677987828) < 1e-12 || box.corr === 1);
    } finally { r.close(); }
  });

  test(`${language} script: errors and limits`, { timeout: 120000 }, async () => {
    const r = new GameRuntime({ language });
    try {
      await assert.rejects(r.script(S.syntax, "{}"), e => e.code === "COMPILE" && /line \d+/.test(e.message), "syntax");
      await assert.rejects(r.script(S.nomain, "{}"), e => e.code === "EXECUTION" && /main\(data\)/.test(e.message), "no main");
      await assert.rejects(r.script(S.raises, "{}"),
        e => e.code === "EXECUTION" && (language === "python" ? /ZeroDivisionError: .*\(line 2\)/ : /RangeError: nope/).test(e.message), "raises");
      await assert.rejects(r.script(S.notJson, "{}"), e => e.code === "EXECUTION" && /JSON/.test(e.message), "not JSON");
      // The CPU budget (and in Python, where nothing interrupts a loop, the hard wall) stops a loop.
      const started = performance.now();
      await assert.rejects(r.script(S.loop, "{}", { cpuMs: 300 }), e => e.code === "LIMIT" && /Time limit exceeded/.test(e.message), "loop");
      assert.ok(performance.now() - started < 5000, "the loop was stopped promptly");
      await assert.rejects(r.script(S.memory, "{}", { cpuMs: 5000 }), e => e.code === "LIMIT" && /Memory limit exceeded/.test(e.message), "memory");
      await assert.rejects(r.script(S.bigResult, "{}"), e => e.code === "LIMIT" && /result/.test(e.message), "big result");
      // Captured text is clipped, never an error.
      const chatty = await r.script(S.chatty, "{}");
      assert.equal(chatty.result, "1");
      assert.equal(chatty.outputTruncated, true);
      assert.ok(Buffer.byteLength(chatty.output) <= SCRIPT_LIMITS.outputBytes);
      assert.ok(chatty.output.startsWith("line 0\nline 1\n"));
      // Host checks: input must be JSON text within the limit; options must be in range.
      await assert.rejects(r.script(S.echo, "{not json"), { code: "DOMAIN" });
      await assert.rejects(r.script(S.echo, JSON.stringify("x".repeat(SCRIPT_LIMITS.inputBytes))), { code: "DOMAIN" });
      await assert.rejects(r.script(S.echo, "{}", { cpuMs: SCRIPT_LIMITS.cpuMsMax + 1 }), { code: "CONFIG" });
      await assert.rejects(r.script(S.echo, "{}", { seed: "nope" }), { code: "CONFIG" });
      await assert.rejects(r.script("#".repeat(SCRIPT_LIMITS.sourceBytes + 1), "{}"), { code: "COMPILE" });
      // A large input within the limit works.
      const big = { rows: Array.from({ length: 20000 }, (_, i) => ({ x: i, y: i * 2, label: `row-${i}` })) };
      assert.equal(JSON.parse((await r.script(S.echo, JSON.stringify(big))).result).rows.length, 20000);
      // The pool still serves agents after scripts were stopped.
      const agent = language === "python" ? "def agent(x):\n    return [add(x + 1)]\n" : "function agent(x) {\n  return [add(x + 1)];\n}\n";
      assert.equal((await r.act(agent, 41, fixture, "1")).calls, JSON.stringify([["add", { k: 42 }]]));
    } finally { r.close(); }
  });
}

test("typescript script: imports and exports are refused; types are erased, not checked", { timeout: 60000 }, async () => {
  const r = new GameRuntime({ language: "typescript" });
  try {
    for (const source of ["import x from 'y';\nfunction main(d) { return 1; }\n", "export function main(d) { return 1; }\n",
      "function main(d) { return import('fs'); }\n"])
      await assert.rejects(r.script(source, "{}"), { code: "COMPILE" }, source);
    // A type error does not block analytics: types are stripped.
    assert.equal((await r.script("function main(d: number): string {\n  return (d as any).k * 2 as any;\n}\n", '{"k": 21}')).result, "42");
  } finally { r.close(); }
});

test("python script inline: same results without a worker", { timeout: 60000 }, async () => {
  const r = new GameRuntime({ language: "python", execution: "inline" });
  try {
    const ranked = await r.script(SCRIPTS.python.rank, JSON.stringify({ objects }));
    assert.deepEqual(JSON.parse(ranked.result), expectedTop);
  } finally { r.close(); }
});
