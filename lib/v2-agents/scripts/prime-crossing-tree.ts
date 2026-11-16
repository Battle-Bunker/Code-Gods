/**
 * Prime Crossing (docs/engine-v2/two-line-tuples.md) under the tree valuation (lib/v2-valuation tree-value.ts), and the
 * coordinator's question (16 Nov): does bounding the inner terms (closeness and third at about 2 bits each), or grading
 * closeness in units of the gap between targets, remove the stall at the first exact prime? Greedy climbs with one
 * seat's income on one pair, every pair move, per valuation: primes stepped per climb and the bits reached. Analysis only.
 *
 *   node --experimental-strip-types scripts/prime-crossing-tree.ts [--draws 200000] [--climbs 24] [--income 2500]
 */
import { parseArgs } from "node:util";
import { applyCall, isInvalid, q, rng, type Score } from "@workspace/v2-core";
import { pairLaw, pairQ, pairType, type PairState } from "@workspace/v2-pair";
import { buildTree, treeLookup } from "../../v2-valuation/src/tree-value.ts";

const { values: o } = parseArgs({ options: { draws: { type: "string", default: "200000" }, climbs: { type: "string", default: "24" }, income: { type: "string", default: "2500" }, ending: { type: "string", default: "1" } } });
const END = Number(o.ending), INCOME = Number(o.income);
type Line = { a: bigint; b: bigint; c: bigint };
function crossing(s: PairState): { x: number; y: number } | null {
  const [p, r] = s.lines as unknown as Line[];
  const D = Number(p!.a * r!.b - r!.a * p!.b);
  if (D === 0) return null;
  return { x: Number(p!.b * r!.c - r!.b * p!.c) / D, y: Number(p!.c * r!.a - r!.c * p!.a) / D };
}
const isPrime = (n: number) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
const ok = (n: number) => n > 1 && n % 10 === END && isPrime(n);
function nearest(v: number): { p: number; next: number } {
  for (let k = 0; k < 1e6; k++) {
    const lo = Math.floor(v) - k, hi = Math.ceil(v) + k, a = ok(lo) ? lo : null, b = ok(hi) ? hi : null;
    const p = a !== null && b !== null ? (v - a <= b - v ? a : b) : (a ?? b);
    if (p !== null) { let n = p + 1; while (!ok(n)) n++; return { p, next: n }; }
  }
  return { p: 0, next: 1 };
}
const offShare = (v: number, m: number) => { const f = Math.floor(v / m); const lo = f === 0 ? -1 : f, hi = f + 1 === 0 ? 1 : f + 1; return Math.min(Math.abs(v - lo * m), Math.abs(hi * m - v)) / m; };
const Q6 = (x: number) => q(BigInt(Math.round(x * 1e6)), 1000000n);
/** The tuple (bigger better each): the prime, minus the distance (in units, or as a share of the gap to the next), minus the third. */
function score(s: PairState, gap: boolean): Score {
  const c = crossing(s);
  if (!c || !Number.isFinite(c.y) || Math.abs(c.y) > 1e9) return null;
  const h = Math.abs(c.y), { p, next } = nearest(h), d = Math.abs(h - p);
  return [q(BigInt(p)), Q6(-(gap ? d / (next - p) : d)), Q6(-offShare(c.x, p))];
}
const law = pairLaw(pairQ), r = rng("prime-crossing-tree");
const states: PairState[] = [];
while (states.length < Number(o.draws)) { const d = law.draw(r, 1); if (d.state) states.push(d.state); }
const trees = { units: treeLookup(buildTree(states.map(s => ({ u: score(s, false), w: 1 })))), gap: treeLookup(buildTree(states.map(s => ({ u: score(s, true), w: 1 })))) };
const VALUATIONS: Record<string, (s: PairState) => number> = {
  "tree": s => trees.units(score(s, false)).bits,
  "tree, inner terms at most 2 bits": s => { const t = trees.units(score(s, false)); return (t.parts[0] ?? 0) + Math.min(2, t.parts[1] ?? 0) + Math.min(2, t.parts[2] ?? 0); },
  "tree, closeness in units of the gap": s => trees.gap(score(s, true)).bits,
};
const AM = ["1", "-1", "2", "-2", "5", "-5", "10", "-10", "1/2", "-1/2"];
const CALLS = ["1", "2"].flatMap(line => [
  ...AM.flatMap(k => [{ m: "si.shift", a: { line, k } }, { m: "si.tilt", a: { line, k } }, { m: "pair.turn", a: { line, k } }, { m: "pair.slide", a: { line, k } }]),
  ...["2", "3", "1/2", "1/3"].map(f => ({ m: "mach.stretch", a: { line, f } })),
]).concat(AM.map(v => ({ m: "sys.translate", a: { u: "0", v } }))).concat(["2", "3", "1/2"].map(f => ({ m: "sys.zoom", a: { f } })));
console.log(`Prime Crossing (ending ${END}), ${states.length} law draws; greedy climbs of ${INCOME}⚡ from law draws, best bits per energy`);
console.log("| valuation | climbs | primes stepped (median / max) | climbs stepping ≥ 2 primes | final bits (median / max) | ends frozen |");
console.log("|---|--:|---|--:|---|--:|");
for (const [name, bits] of Object.entries(VALUATIONS)) {
  const rr = rng("climbs", name), stepped: number[] = [], finals: number[] = [];
  let frozen = 0;
  for (let c = 0; c < Number(o.climbs); c++) {
    let s = law.draw(rr, 1).state;
    while (!s || !score(s, false)) s = law.draw(rr, 1).state;
    let spent = 0, b = bits(s);
    const primes = new Set<number>(), seen = new Set([pairType.encode(s)]);
    let ended = "income";
    for (let i = 0; i < 120; i++) {
      let pick: { s: PairState; fee: number; g: number; b: number } | null = null;
      for (const k of CALLS) {
        const a = applyCall(pairType, pairQ, s, { mutator: k.m, site: 0, args: k.a });
        if (isInvalid(a) || spent + a.price.total > INCOME || seen.has(pairType.encode(a.result))) continue;
        const nb = bits(a.result), g = (nb - b) / Math.max(a.price.total, 1e-9);
        if (g > 0 && (!pick || g > pick.g)) pick = { s: a.result, fee: a.price.total, g, b: nb };
      }
      if (!pick) { ended = "frozen"; break; }
      s = pick.s; spent += pick.fee; b = pick.b; seen.add(pairType.encode(s));
      const u = score(s, false); if (u) primes.add(Number(u[0]!.n));
    }
    if (ended === "frozen") frozen++;
    stepped.push(primes.size); finals.push(b);
  }
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  console.log(`| ${name} | ${stepped.length} | ${med(stepped)} / ${Math.max(...stepped)} | ${stepped.filter(x => x >= 2).length} | ${med(finals).toFixed(1)} / ${Math.max(...finals).toFixed(1)} | ${frozen} |`);
}
