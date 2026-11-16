/**
 * Neighbourhood V2 with POOLED levels (docs/engine-v2/scoring-trial.md, "Neighbourhood, pooled"; the coordinator's
 * correction): the level at size T is every trophy of the rule's set whose size lies within 0.5 doublings of T (if none,
 * the nearest trophy), all counted as members; the neighbourhood is log2|c| Gaussian matched to those members (spread at
 * least 0.5 doublings), the gradient from the scale-free law; energy = the mean cheapest price to the NEAREST member:
 * the shift onto the nearest member (either side, either sign) or the stretch by the exact ratio, priced by the trial's
 * callPrice (log mode). "Basin": each member's basin (midpoints to its neighbours), reached at its nearest edge.
 * Built on the y-intercept. Neutrality: every representation given its own addition at the same fee is the same
 * computation on its own number (built), so it is reported as such rather than re-run.
 *   node --experimental-strip-types scripts/neighbourhood-pooled.ts [--pairs 200]
 */
import { Qn, q, rng, type Q } from "@workspace/v2-core";
import { allMutators, callPrice, drawLine, fromMC, isPrime, isVertical, lineQLenses, TRIAL_LOG, type Line } from "../src/index.ts";

const args = process.argv.slice(2);
const PAIRS = Number((i => (i < 0 ? "200" : args[i + 1]!))(args.indexOf("--pairs")));
const SIGMA = 0.5;
const BY_ID = new Map(allMutators.map(m => [m.id, m]));
const apply = (id: string, a: Record<string, unknown>, l: Line): Line | null => { const r = BY_ID.get(id)!.apply({ lines: [l] }, 0, a as never, lineQLenses); return "invalid" in r || isVertical(r.lines[0]!) ? null : r.lines[0]!; };
const price = (id: string, a: Record<string, unknown>, x: Line, y: Line) => callPrice(id, a, x, y, TRIAL_LOG)?.total ?? Infinity;
const near = (x: number, maxDen = 4): Q => { let best = q(Math.round(x)); for (let d = 2; d <= maxDen; d++) { const t = q(Math.round(x * d), d); if (Math.abs(Qn.toNumber(t) - x) < Math.abs(Qn.toNumber(best) - x)) best = t; } return best; };
const simplest = (a: number, b: number): Q | null => { for (let d = 1; d <= 64; d++) { const n = Math.ceil(a * d - 1e-9); if (n / d <= b + 1e-9) return q(n, d); } return null; };

const SETS: [string, (n: number) => boolean][] = [
  ["whole numbers ending in 7", n => n % 10 === 7],
  ["primes ending in 1", n => n % 10 === 1 && isPrime(BigInt(n))],
  ["primes ending in 101", n => n % 1000 === 101 && isPrime(BigInt(n))],
  ["squares", n => Number.isInteger(Math.sqrt(n))],
  ["powers of 2", n => (n & (n - 1)) === 0],
];
const TS = [100, 1000, 10000, 100000];

function trophies(ok: (n: number) => boolean, lo: number, hi: number): number[] { const out: number[] = []; for (let n = Math.max(1, Math.ceil(lo)); n <= hi; n++) if (ok(n)) out.push(n); return out; }
function energy(ok: (n: number) => boolean, T: number, basin: boolean, seed: string): { e: number; members: number } {
  const lo = T * 2 ** -SIGMA, hi = T * 2 ** SIGMA;
  let members = trophies(ok, lo, hi);
  if (!members.length) { let a = Math.floor(T), b = Math.ceil(T); while (!(a >= 1 && ok(a)) && !ok(b)) { a--; b++; } members = [a >= 1 && ok(a) ? a : b]; }
  // Each member's basin: midpoints to the set's neighbours (searched outside the band too).
  const prevOf = (t: number) => { for (let n = t - 1; n >= 1; n--) if (ok(n)) return n; return 0; }, nextOf = (t: number) => { for (let n = t + 1; ; n++) if (ok(n)) return n; };
  const cells: [number, number][] = basin ? members.map(t => [prevOf(t) ? (prevOf(t) + t) / 2 : 0, (t + nextOf(t)) / 2]) : members.map(t => [t, t]);
  const logs = members.map(Math.log2), mu = logs.reduce((a, b) => a + b, 0) / logs.length;
  const sd = Math.max(SIGMA, Math.sqrt(logs.reduce((a, b) => a + (b - mu) ** 2, 0) / logs.length));
  const r = rng("pooled", seed);
  let sum = 0, n = 0;
  for (let i = 0; i < PAIRS; i++) {
    const g = Math.sqrt(-2 * Math.log(1 - r.unit())) * Math.cos(2 * Math.PI * r.unit()), d = drawLine(r);
    const c0 = near((r.bit() ? 1 : -1) * 2 ** (mu + sd * g)), s = fromMC(q(d.m.p, d.m.q), c0), a0 = Math.abs(Qn.toNumber(c0)), sg = Math.sign(Qn.toNumber(c0)) || 1;
    if (cells.some(([x, y]) => a0 >= x - 1e-9 && a0 <= y + 1e-9)) { n++; continue; }
    // The cells either side of |c|.
    const below = cells.filter(([, y]) => y < a0).sort((x, y) => y[1] - x[1])[0], above = cells.filter(([x]) => x > a0).sort((x, y) => x[0] - y[0])[0];
    let best = Infinity;
    for (const cell of [below, above]) {
      if (!cell) continue;
      const t = simplest(cell[0], cell[1]) ?? q(Math.round(cell[0]));
      for (const target of [Qn.mul(q(sg), t), Qn.mul(q(-sg), t)]) {
        const k = Qn.sub(target, c0), to = apply("si.shift", { k }, s);
        if (to) best = Math.min(best, price("si.shift", { k }, s, to));
        if (!Qn.isZero(c0)) { const f = Qn.div(target, c0), st = apply("mach.stretch", { f }, s); if (st) best = Math.min(best, price("mach.stretch", { f }, s, st)); }
      }
    }
    if (Number.isFinite(best)) { sum += best; n++; }
  }
  return { e: sum / n, members: members.length };
}
const retype = (T: number) => { const s = fromMC(q(1), q(0)), t = fromMC(q(1), q(T)); return price("si.shift", { k: q(T) }, s, t); };
console.log(`| target set | ${TS.map(T => `T ≈ ${T.toLocaleString("en")} exact / basin (members)`).join(" | ")} |\n|---|${TS.map(() => "---").join("|")}|`);
for (const [name, ok] of SETS) console.log(`| ${name} | ${TS.map(T => { const a = energy(ok, T, false, `${name}:${T}:x`), b = energy(ok, T, true, `${name}:${T}:b`); return `${a.e.toFixed(0)} / ${b.e.toFixed(0)} (${a.members})`; }).join(" | ")} |`);
console.log(`| retype price (a shift from 0 to T) | ${TS.map(T => retype(T).toFixed(0)).join(" | ")} |`);
