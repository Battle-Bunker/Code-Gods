/** Energy gate on the big-numbers board: greedy bits-per-energy climbs from law draws, with the field's weight w (energy per bit of height). */
import { applyCall, evaluateObject, isInvalid, rng, variantMutators } from "@workspace/v2-core";
import { bigGrid4, bigGridType, primeBiggestFour, primeRows } from "@workspace/v2-grid";
import { bigGridLaw, bigGridValueFunction, valueLookup } from "../src/index.ts";
const W = Number(process.argv[2] ?? 1), INCOME = 2530, STARTS = Number(process.argv[3] ?? 4);
const T = bigGridType as never, V = bigGrid4;
const AMOUNTS = new Set(["1", "-1", "2", "-2", "5", "-5", "10", "-10"]);
const calls = variantMutators(bigGridType, V).flatMap(m => { const code = m.args(V); return [...(code.enumerate?.(24) ?? [])].map(a => ({ mutator: m.id, args: code.encode(a) as Record<string, string> })); })
  .filter(c => c.args.k === undefined || AMOUNTS.has(c.args.k));
// enumerate stops at 24 bits of arguments: add ±10 cell adds explicitly
for (let i = 0; i < 16; i++) for (const k of ["10", "-10"]) calls.push({ mutator: "cells.add", args: { cell: `r${i >> 2}c${i & 3}`, k } });
console.log(`w=${W}: ${calls.length} calls`);
for (const [fam, p, tb] of [[primeBiggestFour(4), { ends: 1 }, "closeness>row"], [primeRows(4), { edge: "top", ends: 1 }, "closeness>cross"]] as const) {
  const look = valueLookup(bigGridValueFunction(fam as never, p, V, { tieBreaker: tb }));
  const bits = (s: { cells: number[] }) => look(evaluateObject(T, fam as never, p, s, V, tb).score).bits;
  const law = bigGridLaw(V), r = rng("big-gate", fam.id);
  for (let k = 0; k < STARTS; k++) {
    let s = law.draw(r, 1).state!, spent = 0, b0 = bits(s), top = b0, steps = 0;
    const seen = new Set([bigGridType.encode(s)]);
    for (; steps < 400; steps++) {
      let pick: { s: { cells: number[] }; fee: number; b: number; g: number } | null = null;
      for (const c of calls) {
        const a = applyCall(T, V, s, { mutator: c.mutator, site: 0, args: c.args });
        if (isInvalid(a)) continue;
        const fee = a.price.total + (W - 1) * a.price.surcharge, ns = a.result as { cells: number[] };
        if (spent + fee > INCOME || seen.has(bigGridType.encode(ns))) continue;
        const b = bits(ns), g = (b - b0) / fee;
        if (g > 0 && (!pick || g > pick.g)) pick = { s: ns, fee, b, g };
      }
      if (!pick) break;
      s = pick.s; spent += pick.fee; b0 = pick.b; top = Math.max(top, b0); seen.add(bigGridType.encode(s));
    }
    console.log(`  ${fam.id}: top ${top.toFixed(1)} bits for ${spent.toFixed(0)} energy in ${steps} moves: ${bigGridType.encode(s)}`);
  }
}
