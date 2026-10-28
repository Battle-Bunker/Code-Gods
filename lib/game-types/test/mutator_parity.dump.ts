/**
 * Dumps sampled Grid mutator cases (params, input grid, TS apply result, TS cost terms) as JSON for
 * test/mutator_parity.py, which replays them through lib/grid-lab/gridlab/mutators.py.
 * Usage: node --experimental-strip-types lib/game-types/test/mutator_parity.dump.ts OUT.json
 */
import { writeFileSync } from "node:fs";
import { GRID, availableOf, seededRng, type GridValue, type Instantiation, type TypeArgs } from "../src/index.ts";
import { lg } from "../src/mutators.ts";
import { GRID_MUTATORS, type GridMutator } from "../src/grid/mutators.ts";

const rng = seededRng("mutator-parity");
const arr = (g: GridValue) => ({ sym: [...g.sym], col: [...g.col] });
const same = (a: GridValue, b: GridValue) => a.sym.every((v, i) => v === b.sym[i]) && a.col.every((v, i) => v === b.col[i]);

/** Low-entropy grids exercise no-op paths: one symbol and one colour, or two of each in stripes. */
function special(inst: Instantiation): GridValue[] {
  const N = inst.args.size as number, n = N * N, S = inst.terms["symbols.count"], C = inst.terms["colours.count"];
  const flat = { size: N, sym: new Uint8Array(n).fill(rng.int(S)), col: new Uint8Array(n).fill(rng.int(C)) };
  const a = rng.int(S), b = (a + 1) % S, c = rng.int(C), d = (c + 1) % C;
  const two = { size: N, sym: Uint8Array.from({ length: n }, (_, i) => (i % 2 ? a : b)), col: Uint8Array.from({ length: n }, (_, i) => (Math.floor(i / N) % 2 ? c : d)) };
  return [flat, two];
}

const types = GRID.representatives().map((a: TypeArgs) => {
  const inst = GRID.instantiate(a), ms = availableOf(GRID_MUTATORS, inst) as GridMutator[];
  const grids = [GRID.spawn(inst, rng), GRID.spawn(inst, rng), ...special(inst)];
  const cases = ms.flatMap(m => Array.from({ length: 6 }, () => m.sample(rng, inst)).flatMap(p => grids.map(g => {
    const y = m.apply(g, p, inst), t = m.terms(p, inst);
    return {
      id: m.id, p, ...arr(g),
      out: y === null ? null : same(y, g) ? "same" : arr(y),
      base: lg(ms.length), describe: m.describeBits(p, inst), measure: m.measureBits!(p, inst), scope: m.scopeOf!(p, inst),
      erase: t.erase, dcol: t.dcol, dsym: t.dsym, pointwise: m.erasureBits(g, p, inst),
    };
  })));
  const sort = ms.find(m => m.id === "sort_line")!, p = { line: [0, 0], dir: 1 };
  const sortMean = Array.from({ length: 4000 }, () => sort.erasureBits(GRID.spawn(inst, rng), p, inst)).reduce((s, x) => s + x, 0) / 4000;
  return { args: inst.args, available: ms.map(m => m.id), sortMean, cases };
});
writeFileSync(process.argv[2], JSON.stringify(types));
console.log(`wrote ${types.reduce((s, t) => s + t.cases.length, 0)} cases for ${types.length} grid types`);
