// Probe: energy against depth for the fine-structure rules (Unit Fraction, Prime Sliver, Crossing Pattern). Not a test.
import { q, Qn } from "@workspace/v2-core";
import { crossingSliver, estimateLine, fromContinued, fromMC, lineRule, primeSliver, unitFraction } from "../src/index.ts";
const K = 12, est = (F: any, p: any, l: any) => { const r = lineRule(F.dynamic, p); const es = [0, 1, 2].map(i => estimateLine(l, r, undefined, { K, seed: `d${i}` })); return [r.u(l), es.reduce((t, e) => t + e.energy, 0) / 3, Math.max(...es.map(e => e.energy)) - Math.min(...es.map(e => e.energy))]; };
const show = (name: string, rows: [string, number[]][]) => { console.log(name); for (const [d, [u, e, r]] of rows) console.log(`  ${d.padEnd(28)} u ${u!.toFixed(2).padStart(6)}  E ${e!.toFixed(1).padStart(6)}  (range ${r!.toFixed(1)})`); };
let t0 = performance.now();
show("Unit Fraction 3", [1, 2, 3, 4, 6, 8].map(L => [`c = 1/${"1" + "3".repeat(L)}`, est(unitFraction, { suffix: "3" }, fromMC(q(2, 7), q(1n, BigInt("1" + "3".repeat(L)))))]));
show("Prime Sliver 3", [1, 2, 4, 6, 9, 12].map(e => [`m = 1/3^${e}`, est(primeSliver, { p: 3 }, fromMC(q(1n, 3n ** BigInt(e)), q(5)))]));
show("Crossing Pattern 1", [2, 4, 6, 9, 12, 16].map(k => { const X = fromContinued(Array(k).fill(1n)); return [`X = ${Qn.toWire(X)} (${k} ones)`, est(crossingSliver, { pattern: "1" }, fromMC(q(-2), Qn.mul(q(2), X)))]; }));
console.log(`ms per estimate ${((performance.now() - t0) / 54).toFixed(1)}`);
