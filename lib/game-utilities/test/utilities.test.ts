import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  FAMILIES, card, divineLottery, legal, source, utility,
  type ObjectValue, type UtilityDescriptor,
} from "../src/index.ts";
import { DEFAULT_DOMAINS, seeded, spawnSample } from "./support.ts";

const rng = seeded(7);
const draws: UtilityDescriptor[] = FAMILIES.flatMap(f =>
  Array.from({ length: 12 }, () => ({ familyId: f.id, params: f.sample(rng) })));
const familyOf = (d: UtilityDescriptor) => FAMILIES.find(f => f.id === d.familyId)!;

const EDGES: Record<"Int" | "string", ObjectValue[]> = {
  Int: [0, 1, -1, 7, 10, -10, 2147483647, -2147483648, 1000000000, 123456789, 987654321, 1431655765, -1431655766],
  string: ["", "a", " ", "()", ")(", "aaaa", "the cat sat", "9".repeat(40), "\0\x7f\n\t\"\\", "z".repeat(128)],
};

test("every utility function can be satisfied almost perfectly inside the default domain", () => {
  for (const d of draws) {
    const f = familyOf(d), x = f.exemplar(d.params);
    assert.ok(legal(x, DEFAULT_DOMAINS[f.objectType]), `${f.id} exemplar is illegal: ${JSON.stringify(x)}`);
    assert.ok(utility(d, x) >= 0.99, `${f.id} ${JSON.stringify(d.params)} exemplar scores ${utility(d, x)}`);
  }
});

test("random spawned objects are nearly worthless to every family", () => {
  for (const f of FAMILIES) {
    const domain = DEFAULT_DOMAINS[f.objectType];
    let total = 0, high = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const u = utility({ familyId: f.id, params: f.sample(rng) }, spawnSample(domain, rng));
      total += u;
      if (u > 0.5) high++;
    }
    assert.ok(total / n < 0.02, `${f.id} mean utility ${total / n}`);
    assert.ok(high / n < 0.002, `${f.id} P(u > 0.5) = ${high / n}`);
  }
});

test("Python and TypeScript sources agree with the host evaluator", () => {
  const cases = draws.map(d => {
    const f = familyOf(d), domain = DEFAULT_DOMAINS[f.objectType];
    const inputs = [f.exemplar(d.params), ...EDGES[f.objectType], ...Array.from({ length: 25 }, () => spawnSample(domain, rng))];
    return { d, inputs };
  });
  const script = fileURLToPath(new URL("./parity.py", import.meta.url));
  const python = JSON.parse(execFileSync("python3", ["-I", script], {
    input: JSON.stringify(cases.map(c => ({ source: source(c.d, "python"), inputs: c.inputs }))),
    maxBuffer: 64 * 1024 * 1024,
  }).toString()) as number[][];
  cases.forEach((c, i) => c.inputs.forEach((x, j) => {
    const host = utility(c.d, x);
    assert.ok(Math.abs(python[i][j] - host) < 1e-9,
      `${c.d.familyId} ${JSON.stringify(c.d.params)} on ${JSON.stringify(x)}: python ${python[i][j]} host ${host}`);
    assert.ok(host >= 0 && host <= 1);
  }));
});

test("TypeScript sources typecheck under strict mode", () => {
  const files = new Map(draws.map((d, i) => [`/utility-${i}.ts`, `${source(d, "typescript")}\nexport {};\n`]));
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, lib: ["lib.es2022.d.ts"], types: [] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version) => files.has(name)
    ? ts.createSourceFile(name, files.get(name)!, version) : read(name, version);
  const program = ts.createProgram([...files.keys()], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program).map(d =>
    `${d.file?.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}\n${d.file?.text}`);
  assert.deepEqual(diagnostics, []);
});

test("cards explain incentives in plain language before any code", () => {
  for (const d of draws) {
    const c = card(d);
    assert.ok(c.summary.length > 40 && c.summary.length < 420, `${d.familyId} summary length ${c.summary.length}`);
    assert.ok(!c.summary.includes("undefined") && !c.summary.includes("NaN"), c.summary);
    assert.match(c.source.python, /^# .*\n(#.*\n)+(.*\n)*def utility\(x: (int|str)\) -> float:/);
    assert.match(c.source.typescript, /function utility\(x: (number|string)\): number \{/);
    assert.ok(!/raise|throw|isinstance|typeof/.test(c.source.python + c.source.typescript), "no validation boilerplate");
  }
});

test("the divine lottery deals distinct, reachable utility functions", () => {
  for (const objectType of ["Int", "string"] as const) {
    const gods = divineLottery.select(DEFAULT_DOMAINS[objectType], 8, rng);
    assert.equal(gods.length, 8);
    assert.equal(new Set(gods.map(g => JSON.stringify(g))).size, 8);
    for (const g of gods) assert.equal(familyOf(g).objectType, objectType);
  }
  // A short cap excludes families whose ideal objects would not fit.
  const tiny = { ...DEFAULT_DOMAINS.string, stringMaxLength: 20 };
  for (const g of divineLottery.select(tiny, 8, rng)) {
    assert.ok(legal(familyOf(g).exemplar(g.params), tiny));
  }
});
