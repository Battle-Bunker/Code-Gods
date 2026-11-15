/**
 * The tie-breaker's rate at each main-part level (design-principles.md rows 2 and 3; the coordinator's order (ii), 15
 * Nov): from the value function's own weighted draws, per main level L of a pair ladder, the survival of "tie-breaker
 * at least t" among the draws at level L, and its rate in bits per doubling of the tie-breaker. Analysis only.
 *
 *   node --experimental-strip-types scripts/tb-per-level.ts [--family right-angle] [--draws 20000]
 */
import { parseArgs } from "node:util";
import { pairQ, pairLaw, pairType } from "@workspace/v2-pair";
const toNumber = (x: { n: bigint; d: bigint }) => Number(x.n) / Number(x.d);
import { sampledDraws, VALUE_CONFIG } from "../src/value.ts";
import { PAIR_DRAWS_PER_TILT } from "../src/value-pair.ts";

const { values: o } = parseArgs({ options: { family: { type: "string" }, draws: { type: "string" } } });
const only = o.family ? new Set(o.family.split(",")) : null;
const cfg = { ...VALUE_CONFIG, drawsPerTilt: o.draws ? Number(o.draws) : PAIR_DRAWS_PER_TILT };
console.log("| rule | level: draws' share, tie-breaker bits per doubling (survival over its range) |");
console.log("|---|---|");
for (const fam of pairType.families.filter(f => f.keepsParams && (!only || only.has(f.id)))) {
  const params = (fam.dealable() as any[])[0], base = params.q ?? params.k;
  for (const layer of fam.tieBreakers) {
    const { draws } = sampledDraws(pairType, pairLaw(pairQ), fam as never, params, pairQ, layer.id, cfg, "tb-per-level");
    const by = new Map<number, { t: number; w: number }[]>();
    for (const d of draws) {
      const u = d.u;
      if (!u || !u[0] || !u[1]) continue;
      const v = toNumber(u[0]);
      if (!(v > 1)) continue;
      const L = Math.floor(Math.log(v) / Math.log(base) + 1e-9);
      (by.get(L) ?? by.set(L, []).get(L)!).push({ t: toNumber(u[1]), w: d.w });
    }
    const W = draws.reduce((a, d) => a + d.w, 0);
    const cells: string[] = [];
    for (const L of [...by.keys()].sort((a, b) => a - b)) {
      const xs = by.get(L)!.sort((a, b) => b.t - a.t), wl = xs.reduce((a, x) => a + x.w, 0);
      // −log₂ P(tb ≥ t | L) against log₂(1 + |t − worst|): the rate of a doubling of the tie-breaker's climb from its floor.
      const worst = xs[xs.length - 1]!.t;
      const pts: { x: number; y: number }[] = [];
      let acc = 0;
      for (const x of xs) { acc += x.w; pts.push({ x: Math.log2(1 + Math.abs(x.t - worst)), y: -Math.log2(acc / wl) }); }
      const top = pts.filter(p => p.x > 0);
      const n = top.length, mx = top.reduce((a, p) => a + p.x, 0) / n, my = top.reduce((a, p) => a + p.y, 0) / n;
      const slope = n > 2 ? top.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / top.reduce((a, p) => a + (p.x - mx) ** 2, 0) : NaN;
      cells.push(`L${L}: ${(100 * wl / W).toFixed(2)}%, ${slope.toFixed(2)} (${pts[pts.length - 1]!.y.toFixed(1)} bits over ${(xs[0]!.t - worst).toFixed(0)})`);
    }
    console.log(`| ${fam.id}/${layer.id} ${JSON.stringify(params)} | ${cells.join("; ")} |`);
  }
}
