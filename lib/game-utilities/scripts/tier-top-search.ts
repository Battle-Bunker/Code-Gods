/**
 * A second opinion on a tiered draw's top (docs/layered-rules-measurements/expert-pairs.md): the hybrid law's best
 * board is the best its splitting found, and a level deeper than about 30 bits can be missed. This walks from a given
 * board over boards that score at least as much, changing one, two or three cells at a time, and reports every
 * improvement. No improvement in many steps is evidence, not proof.
 *
 *   node --experimental-strip-types scripts/tier-top-search.ts <family> '<json tier list>' <rows, e.g. 3635/3080/0111/2124> [steps] [walks]
 */
import { instantiate, seededRng } from "@workspace/game-types";
import { context, evaluator, family } from "../src/catalog.ts";
import { gridSpec } from "../src/families/grid/_util.ts";
import { withTiers, type GridTiers, type TierValue } from "../src/families/grid/tiers.ts";
import { ninesTiers } from "../src/families/grid/beginner/opposite_nines.ts";
import { mirrorTiers } from "../src/families/grid/layered/mirror-tiers.ts";
import { courtTiers } from "../src/families/grid/layered/royal_court.ts";
import { pairTiers } from "../src/families/grid/layered/pair-tiers.ts";
import type { Params } from "../src/types.ts";

const FAMILIES: Record<string, { spec: GridTiers<any>; base: Params }> = {
  opposite_nines: { spec: ninesTiers, base: {} },
  mirrormancer: { spec: mirrorTiers, base: { axis: "LR" } },
  kings_and_subjects: { spec: courtTiers, base: { squares: "corners" } },
  two_pair: { spec: pairTiers, base: {} },
};
const [id, json, rows, steps = "300000", walks = "6"] = process.argv.slice(2);
const { spec, base } = FAMILIES[id];
const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" }), ctx = context(inst), g = gridSpec(ctx), N = g.N;
const p = withTiers(spec, base as never, JSON.parse(json) as TierValue[], g);
const L = String(family(id).exemplar!(base as never, ctx))[1];
const u = evaluator({ familyId: id, params: p as never }, inst);
const wire = (b: readonly number[]) => Array.from({ length: N }, (_, r) => b.slice(r * N, r * N + N).map(s => `${s}${L}`).join(",")).join("/");
const show = (b: readonly number[]) => Array.from({ length: N }, (_, r) => b.slice(r * N, r * N + N).join("")).join("/");
const score = (b: readonly number[]) => u(wire(b)) as number[];
const cmp = (a: readonly number[], b: readonly number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };

const start = rows.replace(/\//g, "").split("").map(Number);
let best = score(start), bestBoard = start.slice();
console.log(`start ${show(start)} scores [${best.join(", ")}]`);
for (let w = 0; w < Number(walks); w++) {
  const rng = seededRng(`tier-top-search:${id}:${json}:${w}`), b = bestBoard.slice();
  let cur = score(b);
  for (let s = 0; s < Number(steps); s++) {
    const k = 1 + rng.int(3), was: [number, number][] = [];
    for (let j = 0; j < k; j++) { const i = rng.int(N * N); was.push([i, b[i]]); b[i] = rng.int(g.S); }
    const v = score(b);
    if (cmp(v, cur) >= 0) {
      cur = v;
      if (cmp(v, best) > 0) { best = v; bestBoard = b.slice(); console.log(`walk ${w} step ${s}: ${show(b)} scores [${v.join(", ")}]`); }
    } else for (const [i, x] of was.reverse()) b[i] = x;
  }
}
console.log(`best ${show(bestBoard)} scores [${best.join(", ")}] after ${walks} walks of ${steps} steps`);
