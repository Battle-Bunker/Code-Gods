/**
 * Walk-throughs for two-line families in the owner's tuple shape (design-principles.md 3b; undealt designs in
 * docs/engine-v2/two-line-tuples.md): for a few systems, each family's tuple (primary, secondary, third), and what each
 * cheap move by another player does to it, through the real pair mutators and their prices. Analysis only.
 *
 *   node --experimental-strip-types scripts/pair-tuples.ts
 */
import { applyCall, isInvalid, Qn, type Q } from "@workspace/v2-core";
import { pairQ, pairType, type PairState } from "@workspace/v2-pair";

const num = (x: Q) => Number(x.n) / Number(x.d);
type Line = { a: bigint; b: bigint; c: bigint };
const grad = (l: Line) => (l.b === 0n ? null : -Number(l.a) / Number(l.b));
const yint = (l: Line) => (l.b === 0n ? null : -Number(l.c) / Number(l.b));
function crossing(s: PairState): { x: number; y: number } | null {
  const [p, r] = s.lines as unknown as Line[];
  const D = Number(p!.a * r!.b - r!.a * p!.b);
  if (D === 0) return null;
  return { x: Number(p!.b * r!.c - r!.b * p!.c) / D, y: Number(p!.c * r!.a - r!.c * p!.a) / D };
}
const isPrime = (n: number) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
/** The prime ending in d nearest v (the smaller on a tie). */
function nearestPrimeEnding(v: number, d: number): number {
  const ok = (n: number) => n > 1 && n % 10 === d && isPrime(n);
  for (let k = 0; ; k++) { const lo = Math.floor(v) - k, hi = Math.ceil(v) + k; const a = ok(lo) ? lo : null, b = ok(hi) ? hi : null; if (a !== null && b !== null) return v - a <= b - v ? a : b; if (a !== null) return a; if (b !== null) return b; }
}
/** How far v is from the nearest whole multiple of m other than 0, as a share of m. */
const offShare = (v: number, m: number) => { const f = Math.floor(v / m); const lo = f === 0 ? -1 : f, hi = f + 1 === 0 ? 1 : f + 1; return Math.min(Math.abs(v - lo * m), Math.abs(hi * m - v)) / m; };
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Prime Crossing (d): the crossing's height, ignoring its sign; the nearest prime ending in d; the crossing's x near a multiple of it. */
function primeCrossing(s: PairState, d: number): string {
  const c = crossing(s);
  if (!c) return "parallel: no score";
  const h = Math.abs(c.y), p = nearestPrimeEnding(h, d);
  return `(${p}, ${r2(Math.abs(h - p))} away, x ${r2(offShare(c.x, p))} of ${p} from a multiple)`;
}
/** Power Ratio (k): steeper ÷ gentler gradient (sizes); nearest power of k in doublings; the y-intercepts' gap near a multiple of k^n. */
function powerRatio(s: PairState, k: number): string {
  const [p, r] = s.lines as unknown as Line[];
  const g1 = grad(p!), g2 = grad(r!), c1 = yint(p!), c2 = yint(r!);
  if (g1 === null || g2 === null || g1 === 0 || g2 === 0) return "a vertical or flat line: no score";
  const K = Math.max(Math.abs(g1), Math.abs(g2)) / Math.min(Math.abs(g1), Math.abs(g2));
  const n = Math.round(Math.log(K) / Math.log(k)), off = Math.abs(Math.log2(K) - n * Math.log2(k));
  return `(${k}^${n}, ${r2(off)} doublings away, gap ${r2(offShare(c1! - c2!, k ** n))} of ${k ** n} from a multiple)`;
}
/** Power Crossing (k): the crossing's height (size); the nearest power of k in doublings; the crossing's x near a multiple of it. */
function powerCrossing(s: PairState, k: number): string {
  const c = crossing(s);
  if (!c || c.y === 0) return "parallel, or crossing on the x-axis: no score";
  const h = Math.abs(c.y), n = Math.round(Math.log(h) / Math.log(k)), off = Math.abs(Math.log2(h) - n * Math.log2(k));
  return `(${k}^${n}, ${r2(off)} doublings away, x ${r2(offShare(c.x, k ** n))} of ${k ** n} from a multiple)`;
}
const moves = [
  { label: "shift line 1 by 1", m: "si.shift", a: { line: "1", k: "1" } },
  { label: "tilt line 1 by 1", m: "si.tilt", a: { line: "1", k: "1" } },
  { label: "turn line 2 by 1 about the crossing", m: "pair.turn", a: { line: "2", k: "1" } },
  { label: "slide line 1 by 1", m: "pair.slide", a: { line: "1", k: "1" } },
  { label: "slide both up by 1", m: "sys.translate", a: { u: "0", v: "1" } },
  { label: "zoom by 2", m: "sys.zoom", a: { f: "2" } },
  { label: "stretch line 1 by 2", m: "mach.stretch", a: { line: "1", f: "2" } },
];
const systems: [string, string][] = [
  ["y = 2x + 8 and y = −2x + 24 (crossing (4, 16))", "-2,1,-8;2,1,-24"],
  ["y = 2x − 7 and y = −x + 32 (crossing (13, 19))", "-2,1,7;1,1,-32"],
  ["y = x/2 + 30 and y = −3x/2 − 31 (crossing (−30.5, 14.75))", "-1,2,-60;3,2,62"],
  ["y = 8x + 41 and y = x + 41 (crossing (0, 41))", "-8,1,-41;-1,1,-41"],
  ["y = 9x + 1 and y = 2x + 17/2 (ratio 4.5)", "-9,1,-1;-4,2,-17"],
];
for (const [name, enc] of systems) {
  const s = pairType.decode(enc) as PairState;
  console.log(`\n${name}: ${pairType.encode(s)}`);
  console.log(`  Prime Crossing (1): ${primeCrossing(s, 1)}   Power Ratio (2): ${powerRatio(s, 2)}   Power Crossing (2): ${powerCrossing(s, 2)}`);
  for (const mv of moves) {
    const a = applyCall(pairType, pairQ, s, { mutator: mv.m, site: 0, args: mv.a });
    if (isInvalid(a)) { console.log(`  ${mv.label}: refused`); continue; }
    console.log(`  ${mv.label} (${a.price.total.toFixed(1)}⚡): PC ${primeCrossing(a.result, 1)}   PR ${powerRatio(a.result, 2)}   PW ${powerCrossing(a.result, 2)}`);
  }
}
