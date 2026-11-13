/**
 * A general sweep of candidate tier values through a family's own card (docs/layered-rules-measurements/two-pair.md,
 * expert-pairs.md): the liveness of each value, or pair of values, on the base's top, as one markdown table row each.
 *
 *   node --experimental-strip-types scripts/tier-sweep.ts <family> '<json list of tier lists>' [--band 6,26] [--shape 4,base10]
 *   node --experimental-strip-types scripts/tier-sweep.ts <family> --gate
 *
 * `[[{"id":"links"}],[{"id":"lines","x":18},{"id":"squares","x":14}]]` measures one single tier and one pair. `--gate`
 * prints what a one-cell greedy climber of the base holds after 4, 10 and 20 moves (the gate is its ten-move level).
 * A script, not a test: each row builds a hybrid law (15 to 60 seconds). Run several processes side by side.
 */
import { instantiate, seededRng } from "@workspace/game-types";
import { context, evaluator, family } from "../src/catalog.ts";
import { gridSpec } from "../src/families/grid/_util.ts";
import { withTiers, type TierValue } from "../src/families/grid/tiers.ts";
import { hybridLawOf, tierLiveness } from "../src/families/grid/tiers-hybrid.ts";
import { SPEC_BASE, TIER_SPECS } from "./tier-specs.ts";
import type { Params } from "../src/types.ts";

const FAMILIES = Object.fromEntries(Object.entries(TIER_SPECS).map(([id, spec]) => [id, { spec, base: SPEC_BASE[id] ?? {} as Params }]));

const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i < 0 ? undefined : argv[i + 1]; };
const id = argv[0], { spec, base } = FAMILIES[id];
const [size, symbols] = (opt("shape") ?? "4,base10").split(",");
const inst = instantiate("Grid", { size: Number(size), symbols, colours: "mono" });
const ctx = context(inst), g = gridSpec(ctx), N = g.N, S = g.S;
const band = opt("band") ? { min: Number(opt("band")!.split(",")[0]), max: Number(opt("band")!.split(",")[1]) } : undefined;
const cmp = (a: readonly number[], b: readonly number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
const tup = (o: unknown): number[] => (typeof o === "number" ? [o] : [...(o as number[])]);
const rows = (b: readonly number[]) => Array.from({ length: N }, (_, r) => b.slice(r * N, r * N + N).map(s => "0123456789ABCDEF"[s]).join("")).join("/");

if (argv.includes("--gate")) {
  const probe = evaluator({ familyId: id, params: base as never }, inst);
  const L = String(family(id).exemplar!(base as never, ctx))[1];
  const wire = (b: readonly number[]) => Array.from({ length: N }, (_, r) => b.slice(r * N, r * N + N).map(s => "0123456789ABCDEF"[s] + L).join(",")).join("/");
  const score = (b: readonly number[]) => tup(probe(wire(b)));
  const rng = seededRng(`tier-sweep:${id}`);
  for (const moves of [4, 10, 20]) {
    const reached: number[] = [];
    for (let k = 0; k < 400; k++) {
      const b = Array.from({ length: N * N }, () => rng.int(S));
      let cur = score(b);
      for (let m = 0; m < moves; m++) {
        let best: [number, number] | null = null, bv = cur;
        for (let i = 0; i < b.length; i++) {
          const was = b[i];
          for (let s = 0; s < S; s++) { if (s === was) continue; b[i] = s; const v = score(b); if (cmp(v, bv) > 0) { bv = v; best = [i, s]; } }
          b[i] = was;
        }
        if (!best) break;
        b[best[0]] = best[1];
        cur = bv;
      }
      reached.push(cur[0]);
    }
    const top = Math.max(...reached), hist = Array.from({ length: top + 1 }, (_, k) => reached.filter(c => c === k).length);
    console.log(`${id} greedy ${moves} moves (400 starts): mean ${(reached.reduce((a, c) => a + c, 0) / reached.length).toFixed(2)}, median ${reached.slice().sort((a, b) => a - b)[200]}, histogram 0..${top} ${hist.join("/")}`);
  }
} else {
  const sets = JSON.parse(argv[1]) as TierValue[][];
  for (const vs of sets) {
    const p = withTiers(spec, base as never, vs, g), t0 = performance.now();
    const live = tierLiveness(id, spec, p, ctx, band)!, law = hybridLawOf(id, spec, p, ctx)!;
    const secs = (performance.now() - t0) / 1000;
    const name = vs.map(v => `${v.id}${"x" in v ? ` x=${v.x}` : ""}${"y" in v ? ` y=${v.y}` : ""}`).join(" + ");
    const baseTop = -law.baseLevels[law.baseLevels.length - 1][1];
    console.log(`| ${id} | ${name} | ${tup(live.tierTop).join(",")} | ${live.addedBits.toFixed(1)} | ${(-law.levels[law.levels.length - 1][1]).toFixed(1)} | ${baseTop.toFixed(1)} | ${law.levels.length} | ${rows([...law.best])} | ${secs.toFixed(0)} | ${live.problems.join("; ") || "none"} |`);
  }
}
