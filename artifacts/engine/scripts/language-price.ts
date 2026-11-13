/**
 * The summon price of the same program in Python and in TypeScript, by part (docs/energy-model.md §5.1). Prices are the
 * runtime's own inspection (lib/game-runtime: ast-bits-v1, ts-ast-bits-v1-uniform) on the default setup's board, as the
 * engine's `validate` reports them, before and after the language weight (game-core LANGUAGE_SPECS.structureWeight, fairSummonBits).
 *
 *   cd artifacts/engine && node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/language-price.ts
 *
 * Reference programs: the coordination policies (lib/game-utilities/scripts/coordination-programs, one file per policy
 * and language) and four small pairs written here to be the same program statement for statement.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETUP_SEED_ID, fairSummonBits, seedSetupSettings, instantiationOf, codecOf, type Language } from "@workspace/game-core";
import { objectType } from "@workspace/game-types";
import { createRuntime, type ActSettings, type PricingVocab } from "@workspace/game-runtime";

const settings = seedSetupSettings(DEFAULT_SETUP_SEED_ID), inst = instantiationOf(settings), parts = objectType(inst.objectType).prelude(inst);
const room = {
  objectType: inst.objectType, wireMaxLength: codecOf(settings).maxLength, interactionComputeMs: settings.interactionComputeMs, stepBudget: settings.stepBudget,
  prelude: { key: parts.hash, python: parts.python, js: parts.js, dts: parts.dts, pricing: parts.pricing as unknown as { python: PricingVocab; typescript: PricingVocab } },
} as ActSettings;

const SMALL: Record<string, Record<Language, string>> = {
  "skip always": { python: "def agent(grid):\n    return []\n", typescript: "function agent(grid) { return []; }\n" },
  "one fixed write": { python: "def agent(grid):\n    return [write(grid.cells[0], 7)]\n", typescript: "function agent(grid) { return [write(grid.cells[0], 7)]; }\n" },
  "loop and if": {
    python: "def agent(grid):\n    for c in grid.cells:\n        if c.value < 5:\n            return [write(c, 9)]\n    return []\n",
    typescript: "function agent(grid) {\n  for (const c of grid.cells) {\n    if (c.value < 5) return [write(c, 9)];\n  }\n  return [];\n}\n",
  },
  "sum, then act": {
    python: "def agent(grid):\n    total = 0\n    for c in grid.cells:\n        total = total + c.value\n    if total > 72:\n        return []\n    return [write(grid.cells[5], 9)]\n",
    typescript: "function agent(grid) {\n  let total = 0;\n  for (const c of grid.cells) total = total + c.value;\n  if (total > 72) return [];\n  return [write(grid.cells[5], 9)];\n}\n",
  },
};
const dir = join(import.meta.dirname, "../../../lib/game-utilities/scripts/coordination-programs");
const POLICIES = ["random", "greedy", "considerate", "payoff", "cooperator", "deny"];
const programs: [string, Record<Language, string>][] = [
  ...Object.entries(SMALL),
  ...POLICIES.map((p): [string, Record<Language, string>] => [`policy: ${p}`, { python: readFileSync(join(dir, `${p}.py`), "utf8"), typescript: readFileSync(join(dir, `${p}.ts`), "utf8") }]),
];

export type PricedPair = { name: string; python: number; typescript: number; typescriptWeighted: number; structure: { python: number; typescript: number }; names: { python: number; typescript: number }; literals: { python: number; typescript: number } };

/** Price every reference program in both languages with the runtime's own inspection (no engine needed). */
export async function pricePairs(): Promise<PricedPair[]> {
  const runtimes = { python: createRuntime({ language: "python", workers: 1, queueLimit: 64 }), typescript: createRuntime({ language: "typescript", workers: 1, queueLimit: 64 }) };
  try {
    const out: PricedPair[] = [];
    for (const [name, source] of programs) {
      const py = await runtimes.python.inspect(source.python, room), ts = await runtimes.typescript.inspect(source.typescript, room);
      const total = (i: typeof py) => i.cost + i.literalMoveFallbackBits.reduce((a, b) => a + b, 0);
      out.push({ name, python: total(py), typescript: total(ts), typescriptWeighted: fairSummonBits("typescript", total(ts), ts.parts.structure).cost,
        structure: { python: py.parts.structure, typescript: ts.parts.structure }, names: { python: py.parts.names, typescript: ts.parts.names },
        literals: { python: py.parts.literals, typescript: ts.parts.literals } });
    }
    return out;
  } finally { for (const r of Object.values(runtimes)) r.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = (x: number) => x.toFixed(1), rows = await pricePairs();
  console.log("| program | Python | TypeScript, unweighted | ratio | structure, Python | structure, TypeScript | Python ÷ TypeScript structure | names Py / TS | literals Py / TS | TypeScript, weighted | ratio |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.name} | ${f(r.python)} | ${f(r.typescript)} | ${(r.typescript / r.python).toFixed(2)} | ${f(r.structure.python)} | ${f(r.structure.typescript)} | ${(r.structure.python / r.structure.typescript).toFixed(3)} | ${f(r.names.python)} / ${f(r.names.typescript)} | ${f(r.literals.python)} / ${f(r.literals.typescript)} | ${f(r.typescriptWeighted)} | ${(r.typescriptWeighted / r.python).toFixed(2)} |`);
  const sum = (pick: (r: PricedPair) => number) => rows.reduce((a, r) => a + pick(r), 0);
  console.log(`\nStructure bits over all programs: Python ${f(sum(r => r.structure.python))}, TypeScript ${f(sum(r => r.structure.typescript))}: ratio ${(sum(r => r.structure.python) / sum(r => r.structure.typescript)).toFixed(3)}.`);
}
