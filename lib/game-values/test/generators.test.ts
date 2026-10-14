import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import {
  generate, GenerationError, registry, GENERATOR_ID, payoffs,
  uniformAgentPayoffs, composeConstantAgents,
} from "../src/index.ts";
import type { ObjectValue, Pantheon } from "../src/index.ts";
import { random, sampleDomain } from "../src/model.ts";
import { screen, MARGIN } from "../src/screen.ts";

const golden = JSON.parse(readFileSync(new URL("../fixtures/golden.json", import.meta.url), "utf8"));
const close = (actual: number, expected: number) => assert.ok(
  Math.abs(actual - expected) <= 1e-12, `${actual} != ${expected}`,
);
const vectorClose = (a: number[], b: number[]) => {
  assert.equal(a.length, b.length);
  a.forEach((v, i) => close(v, b[i]));
};
const integer = generate({ objectType: "Int", seed: 42 });
const string = generate({ objectType: "string", seed: 42 });

test("golden fixtures lock seed, formulas and signed/ASCII edge conventions", () => {
  for (const [g, fixtures] of [[integer, golden.integer], [string, golden.string]] as const) {
    for (const fixture of fixtures) vectorClose(g.gods.map(god => god.evaluate(fixture.input)), fixture.values);
  }
  assert.equal(integer.manifest.preferences[0].kind, "cyclic-well");
  assert.deepEqual(integer.manifest.preferences[0], { kind: "cyclic-well", period: 16, center: 0, width: 2 });
  assert.deepEqual(string.manifest.preferences[0], { kind: "edit-well", prototype: "kkkk", width: 2 });
});

test("actual exported Python and TypeScript match host on fixtures, samples and invalid inputs", async () => {
  const cases = [
    { g: integer, fixtures: golden.integer, extra: [-2147483647, -99, -0, 16, 2147483646], invalid: [null, true, 1.5, "2", -2147483649, 2147483648] },
    { g: string, fixtures: golden.string, extra: ["k".repeat(128), "\0".repeat(128), "\x7f".repeat(128), "\n\r\t", "\"\\", "x".repeat(128)], invalid: [null, true, 3, "é", "😀", "x".repeat(129)] },
    { g: generate({ objectType: "Int", seed: 0, deityCount: 8, intMin: -100, intMax: 100 }), fixtures: [], extra: [-100, 100, 0], invalid: [-101, 101, false] },
    { g: generate({ objectType: "string", seed: 0xffffffff, deityCount: 8, stringMaxLength: 4 }), fixtures: [], extra: ["", "\x00\x01\x02\x03", "abcd"], invalid: ["abcde", "\u0080", []] },
  ];
  const pythonJobs = [];
  const expected = [];
  for (const c of cases) {
    const below = random(123);
    const inputs: ObjectValue[] = [...c.fixtures.map((f: { input: ObjectValue }) => f.input), ...c.extra,
      ...Array.from({ length: 32 }, () => sampleDomain(c.g.manifest.domain, below))];
    for (const god of c.g.gods) {
      const js = stripTypeScriptTypes(god.source.typescript);
      const exported = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
      for (const x of inputs) close(exported.value(x), god.evaluate(x));
      for (const x of c.invalid) {
        assert.throws(() => exported.value(x));
        assert.throws(() => god.evaluate(x as ObjectValue));
      }
      pythonJobs.push({ source: god.source.python, inputs, invalid: c.invalid });
      expected.push(inputs.map(god.evaluate));
    }
  }
  const script = `
import json, sys
result = []
for job in json.load(sys.stdin):
    namespace = {}
    exec(job["source"], namespace)
    f = namespace["value"]
    for x in job["invalid"]:
        try:
            f(x)
        except (ValueError, TypeError):
            pass
        else:
            raise AssertionError("invalid input accepted")
    result.append([f(x) for x in job["inputs"]])
json.dump(result, sys.stdout)
`;
  const result = spawnSync("python3", ["-c", script], {
    input: JSON.stringify(pythonJobs), encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  const actual = JSON.parse(result.stdout);
  actual.forEach((values: number[], i: number) => vectorClose(values, expected[i]));
});

function verifyPoliticalClaims(g: Pantheon) {
  const r = g.screening;
  assert.equal(r.accepted, true);
  assert.equal(r.commonValueMaximizers.length, 0);
  assert.equal(r.commonPayoffMaximizers.length, 0);
  assert.ok(r.pairs.some(p => p.pair.join(",") === "0,1"));
  assert.ok(new Set(r.coalitions.map(w => w.winners.join(","))).size >= 2);
  for (const w of [...r.coalitions, ...r.pairs.flatMap(p => [p.cooperation, p.conflict])]) {
    for (const s of [w.before, w.after]) {
      vectorClose(s.values, g.gods.map(god => god.evaluate(s.object)));
      vectorClose(s.payoffs, s.values.map((v, i) => v * s.values.filter((_, j) => j !== i).reduce((a, b) => a + b, 0)));
    }
    vectorClose(w.deltaPayoffs, w.after.payoffs.map((v, i) => v - w.before.payoffs[i]));
    vectorClose(w.deltaValues, w.after.values.map((v, i) => v - w.before.values[i]));
  }
  for (const p of r.pairs) {
    const [i, j] = p.pair;
    assert.ok(p.cooperation.deltaPayoffs[i] > MARGIN && p.cooperation.deltaPayoffs[j] > MARGIN);
    assert.ok(p.conflict.deltaPayoffs[i] * p.conflict.deltaPayoffs[j] < -(MARGIN ** 2));
    assert.ok(p.cooperativeTransitions > 1 && p.conflictingTransitions > 1);
  }
  for (const c of r.coalitions) assert.ok(c.winners.length >= 2 && c.losers.length >= 1);
}

test("same-pair politics and multiple coalitions hold for seeds and 3–8 player rosters", () => {
  for (const seed of [0, 1, 42, 0xffffffff]) {
    for (let deityCount = 3; deityCount <= 8; deityCount++) {
      for (const objectType of ["Int", "string"] as const) {
        verifyPoliticalClaims(generate({ objectType, seed, deityCount }));
      }
    }
  }
});

test("uniform-spawn diagnostics distinguish local politics from constant repair", () => {
  assert.ok(integer.screening.distribution.localMoves.conflictingPairFraction > 0);
  assert.equal(string.screening.distribution.localMoves.conflictingPairFraction, 0);
  assert.equal(string.screening.distribution.cleanupMoves.cooperativePairFraction, 1);
  assert.ok(string.screening.distribution.constantSwitches.conflictingPairFraction > 0);
  const below = random(789);
  const samples = Array.from({ length: 10000 }, () => sampleDomain({ objectType: "string", stringMaxLength: 4 }, below) as string);
  const maxLengthFraction = samples.filter(s => s.length === 4).length / samples.length;
  assert.ok(maxLengthFraction > 0.98 && maxLengthFraction < 0.999);
  assert.equal(sampleDomain({ objectType: "string", stringMaxLength: 0 }, random(3)), "");
});

test("caps, invalid settings and degenerate domains fail explicitly, not silently clamp", () => {
  for (const options of [
    { objectType: "Int", seed: -1 }, { objectType: "Int", seed: 2 ** 32 },
    { objectType: "Int", seed: NaN }, { objectType: "Int", seed: 1.1 },
    { objectType: "Int", seed: 42, intMin: 0, intMax: 1 },
    { objectType: "Int", seed: 42, intMin: -2147483649 },
    { objectType: "Int", seed: 42, intMax: 2147483648 },
    { objectType: "Int", seed: 42, intMin: 2, intMax: 1 },
    { objectType: "Int", seed: 42, deityCount: 2 },
    { objectType: "Int", seed: 42, deityCount: 9 },
    ...[-1, 0, 3, 4097, Infinity, 4.5].map(stringMaxLength => ({ objectType: "string", seed: 42, stringMaxLength })),
  ]) assert.throws(() => generate(options as Parameters<typeof generate>[0]), GenerationError);
  for (const x of [NaN, Infinity, -Infinity, 1.2, true, undefined]) {
    assert.throws(() => integer.gods[0].evaluate(x as number));
  }
  for (const [intMin, intMax] of [[-2147483648, -2147483617], [2147483616, 2147483647], [-32, -1]]) {
    const g = generate({ objectType: "Int", seed: 42, intMin, intMax });
    verifyPoliticalClaims(g);
    for (const x of [intMin, intMax]) assert.ok(g.gods.every(god => god.evaluate(x) >= 0));
  }
});

test("saturation is reported at large caps and evaluation remains bounded", () => {
  const g = generate({ objectType: "string", seed: 42, stringMaxLength: 4096 });
  const output = "\0".repeat(4096);
  assert.ok(g.gods.every(god => god.evaluate(output) > 0 && god.evaluate(output) < 1e-6));
  assert.ok(g.screening.warnings.some(w => w.includes("saturation")));
});

test("screen rejects constant deities, identical deities and a shared optimum", () => {
  const identical = integer.gods.map(g => ({ ...g, evaluate: () => 0.5 }));
  const report = screen(integer.manifest, identical);
  assert.equal(report.accepted, false);
  assert.ok(report.rejections.some(s => s.includes("Indistinguishable")));
  assert.ok(report.rejections.some(s => s.includes("common value optimum")));
  assert.ok(report.rejections.some(s => s.includes("common payoff optimum")));
  assert.equal(report.pairs.length, 0);
});

test("reproducibility, independent instances, registry and immutable evaluator parameters", () => {
  const again = registry[GENERATOR_ID]({ objectType: "Int", seed: 42 });
  assert.deepEqual(again.manifest, integer.manifest);
  assert.deepEqual(again.screening, integer.screening);
  assert.deepEqual(again.gods.map(g => g.source), integer.gods.map(g => g.source));
  assert.notDeepEqual(generate({ objectType: "Int", seed: 43 }).manifest.preferences, integer.manifest.preferences);
  assert.throws(() => { (integer.manifest.preferences[0] as { width: number }).width = 10; });
});

test("constants stay legal; identity, dilution, composition and exact payoff rule are explicit", () => {
  vectorClose(payoffs([0.5, 0.5, 1]), [0.75, 0.75, 1]);
  vectorClose(payoffs([0.2, 0.8]), [0.16, 0.16]);
  assert.throws(() => payoffs([NaN]));
  const input = 8;
  const a = integer.screening.constants[0].output;
  const b = integer.screening.constants[1].output;
  const identity = payoffs(integer.gods.map(g => g.evaluate(input)));
  const constantA = payoffs(integer.gods.map(g => g.evaluate(a)));
  vectorClose(uniformAgentPayoffs(integer.gods, input, [null]), identity);
  vectorClose(uniformAgentPayoffs(integer.gods, input, [a, a, a]), constantA);
  vectorClose(uniformAgentPayoffs(integer.gods, input, [null, a, a]),
    constantA.map((v, i) => (2 * v + identity[i]) / 3));
  assert.equal(composeConstantAgents(input, [a, null, b, null]), b);
  assert.equal(composeConstantAgents(input, [b, a]), a);
  assert.equal(composeConstantAgents(input, []), input);
  assert.throws(() => uniformAgentPayoffs(integer.gods, input, []));
  assert.ok(integer.screening.constants[0].gainOverIdentity[0] > 0);
});
