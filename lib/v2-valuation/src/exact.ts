/**
 * Exact rung values under a potential (analytic calibration study, docs/engine-v2/analytic-calibration.md §3).
 *
 * On `line-z` a line is y = mx + c and its read length is φ = mixedInt(m) + mixedInt(c), with mixedInt a prefix code
 * whose Kraft sum is exactly 1. Where the walk satisfies detailed balance (every price list but gen.nudge's
 * renormalising branch, §2), its stationary law is π(m, c) = p(m)·p(c), p(n) = 2^−mixedInt(n). A rung's value is
 * V_k = −log2 π(level ≥ k), so it is a sum over lines. Enumerating every (m, c) with φ(m) + φ(c) ≤ Φ gives the mass
 * M_k inside; the mass outside is T = 1 − Σ_inside π, computed from the same enumeration, so
 *   −log2 (M_k + T) ≤ V_k ≤ −log2 M_k        (rigorous, whatever the rule does outside the budget).
 * A rung is certified to the 2% target when T ≤ 0.02 · M_k.
 */
import { compareScores, evaluateObject, mixedIntBits, objectLadder, levelOf, q, toWireQ, type Q, type RuleFamily, type TieBreaker, type Variant } from "@workspace/v2-core";

/** Compares two score components (null ranks last), as compareScores does. */
const compareComponent = (a: Q | null, b: Q): number => compareScores([a], [b]);
import { fromMC, lineParams, lineType, type LineState } from "@workspace/v2-linear";

/** The exact sums enumerate single lines: a variant with several lines per object needs its own law (not built). */
function oneLine(variant: Variant): void {
  const p = lineParams(variant);
  if (p.linesPerObject !== 1 || p.domain !== "Z") throw new Error(`${variant.id}: exact sums are built for one whole-number line per object`);
}

/** Every integer n with mixedInt(n) ≤ budget, with its bits: by prime factorisation, cheapest primes first. */
export function integersWithin(budget: number): { n: bigint; bits: number }[] {
  const primes: number[] = [];
  for (let k = 2; primes.length === 0 || primes[primes.length - 1]! < 2 * budget; k++) if (primes.every(p => k % p)) primes.push(k);
  const out: { n: bigint; bits: number }[] = mixedIntBits(0n) <= budget ? [{ n: 0n, bits: mixedIntBits(0n) }] : [];
  const rec = (i: number, n: bigint, sum: number): void => {
    if (n > 1n || i === 0 && n === 1n) {
      const b = mixedIntBits(n);
      if (b <= budget) { out.push({ n, bits: b }, { n: -n, bits: b }); }
    }
    for (let j = i; j < primes.length; j++) {
      const p = primes[j]!;
      // mixedPos grows by p/2 per factor p: stop once even the cheapest addition is over budget.
      if (mixedIntBits(1n) + (sum + p) / 2 > budget + 1e-9) break;
      rec(j, n * BigInt(p), sum + p);
    }
  };
  rec(0, 1n, 0);
  return out.sort((a, b) => a.bits - b.bits);
}

export interface ExactRungs {
  /** Per rung: the certified interval [lo, hi] of V_k in bits (hi Infinity when no enumerated line reaches it). */
  readonly lo: readonly number[];
  readonly hi: readonly number[];
  /** The mass outside the budget. */
  readonly tail: number;
  readonly lines: number;
  readonly budget: number;
}

/** Exact rung values for a rule on a whole-number variant, every line within φ(m) + φ(c) ≤ budget enumerated. */
export function exactRungs<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tieBreaker: TieBreaker, budget: number): ExactRungs {
  oneLine(variant);
  const ladder = objectLadder(lineType, family, params, variant, tieBreaker);
  const ints = integersWithin(budget);
  const mass = new Array<number>(ladder.length).fill(0);
  let inside = 0, lines = 0;
  // Kahan sums: the tail is a small difference from 1.
  let comp = 0;
  for (const m of ints) {
    for (const c of ints) {
      if (m.bits + c.bits > budget) break;
      const w = 2 ** -(m.bits + c.bits);
      const y = w - comp, t = inside + y; comp = (t - inside) - y; inside = t;
      lines++;
      const score = evaluateObject(lineType, family, params, { lines: [fromMC(q(m.n), q(c.n))] }, variant, tieBreaker).score;
      mass[levelOf(score, ladder)]! += w;
    }
  }
  const tail = Math.max(0, 1 - inside);
  const lo: number[] = [], hi: number[] = [];
  let acc = 0;
  for (let k = ladder.length - 1; k >= 0; k--) {
    acc += mass[k]!;
    lo[k] = k === 0 ? 0 : -Math.log2(Math.min(1, acc + tail));
    hi[k] = k === 0 ? 0 : -Math.log2(acc);
  }
  return { lo, hi, tail, lines, budget };
}

/**
 * A rule whose main and tie-breaker components each depend on one coefficient only (m or c), as declared by `on`. The
 * joint law is then a product of the 1D laws p(m)·p(c), and each rung's mass is a sum over pairs of component values,
 * from one 1D enumeration within `budget` bits: rigorous with tail T1 = 1 − Σ_enumerated p(n) for each coordinate
 * (a pair is outside when either coordinate is, so the outside mass is at most 2·T1).
 */
export function exactRungsSeparable<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tieBreaker: TieBreaker,
  on: readonly ("m" | "c")[], budget: number): ExactRungs & { readonly separableChecked: number } {
  oneLine(variant);
  const ladder = objectLadder(lineType, family, params, variant, tieBreaker);
  const ints = integersWithin(budget);
  const line = (m: bigint, c: bigint) => ({ lines: [fromMC(q(m), q(c))] });
  // Component j of the score as a function of its coefficient: the other coefficient held at a reference value.
  const REF = 7n;
  const comp = (j: number, n: bigint) => {
    const s = evaluateObject(lineType, family, params, on[j] === "m" ? line(n, REF) : line(REF, n), variant, tieBreaker).score;
    return s === null ? undefined : s[j] ?? null;
  };
  // Check the declaration on lines where both coefficients vary.
  let checked = 0;
  for (let i = 0; i < 400; i++) {
    const m = ints[(i * 7919) % Math.min(ints.length, 2000)]!.n, c = ints[(i * 104729 + 13) % Math.min(ints.length, 2000)]!.n;
    const s = evaluateObject(lineType, family, params, line(m, c), variant, tieBreaker).score;
    const want = [comp(0, on[0] === "m" ? m : c), ...(on.length > 1 ? [comp(1, on[1] === "m" ? m : c)] : [])];
    const anyUndef = want.some(x => x === undefined);
    const wire = (xs: readonly unknown[]) => xs.map(x => (x === null || x === undefined ? String(x) : toWireQ(x as never))).join(",");
    if ((s === null) !== anyUndef || (s !== null && wire(s) !== wire(want))) {
      throw new Error(`${family.id}+${tieBreaker}: not separable as declared at m=${m}, c=${c}`);
    }
    checked++;
  }
  // 1D laws of each component: value key → mass.
  const law = (j: number) => {
    const out = new Map<string, { v: unknown; w: number }>();
    for (const n of ints) {
      const v = comp(j, n.n);
      const k = v === undefined ? "undefined" : v === null ? "null" : toWireQ(v as never);
      const e = out.get(k) ?? { v, w: 0 };
      e.w += 2 ** -n.bits;
      out.set(k, e);
    }
    return [...out.values()];
  };
  let T1 = 1, cmp = 0;
  for (const n of ints) { const y = 2 ** -n.bits - cmp, t = (1 - T1) + y; cmp = (t - (1 - T1)) - y; T1 = 1 - t; }
  T1 = Math.max(0, T1);
  const mass = new Array<number>(ladder.length).fill(0);
  if (on.length === 1 || on[0] === on[1]) {
    // One coefficient carries every component: one joint 1D law.
    for (const n of ints) {
      const s = evaluateObject(lineType, family, params, on[0] === "m" ? line(n.n, REF) : line(REF, n.n), variant, tieBreaker).score;
      mass[levelOf(s, ladder)]! += 2 ** -n.bits;
    }
  } else {
    // A rung depends on a component only through the thresholds it meets: bucket each 1D law by that class (keeping
    // one representative value), then pair the classes.
    const thresholds = (j: number) => [...new Set(ladder.flatMap(r => (r.score && r.score[j] !== undefined && r.score[j] !== null ? [r.score[j]!] : [])).map(t => toWireQ(t)))]
      .map(w => ladder.find(r => r.score && r.score[j] && toWireQ(r.score[j]!) === w)!.score![j]!);
    const bucket = (j: number) => {
      const ts = thresholds(j);
      const out = new Map<string, { v: unknown; w: number }>();
      for (const e of law(j)) {
        const key = e.v === undefined ? "undefined" : e.v === null ? "null" : ts.map(t => (compareComponent(e.v as never, t) >= 0 ? 1 : 0)).join("");
        const b = out.get(key) ?? { v: e.v, w: 0 };
        b.w += e.w;
        out.set(key, b);
      }
      return [...out.values()];
    };
    for (const a of bucket(0)) for (const b of bucket(1)) {
      const score = a.v === undefined || b.v === undefined ? null : [a.v, b.v] as never;
      mass[levelOf(score, ladder)]! += a.w * b.w;
    }
  }
  const tail = on.length > 1 && on[0] !== on[1] ? 2 * T1 : T1;
  const lo: number[] = [], hi: number[] = [];
  let acc = 0;
  for (let k = ladder.length - 1; k >= 0; k--) {
    acc += mass[k]!;
    lo[k] = k === 0 ? 0 : -Math.log2(Math.min(1, acc + tail));
    hi[k] = k === 0 ? 0 : -Math.log2(acc);
  }
  return { lo, hi, tail, lines: ints.length, budget, separableChecked: checked };
}

/**
 * The dominant-state estimate (study §4), which needs no potential: a rung's value from its cheapest lines alone,
 * V_k ≈ φ_min(U_k) − φ_min(all) − log2 (lines at φ_min(U_k)), over the lines within `budget`. Under the potential it
 * is the leading term of the exact sum; without one, φ is the minimum net climbing price and the count the number of
 * cheapest paths.
 */
export function dominantRungs<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tieBreaker: TieBreaker, budget: number): number[] {
  oneLine(variant);
  const ladder = objectLadder(lineType, family, params, variant, tieBreaker);
  const ints = integersWithin(budget);
  const best = new Array<number>(ladder.length).fill(Infinity), count = new Array<number>(ladder.length).fill(0);
  for (const m of ints) for (const c of ints) {
    const phi = m.bits + c.bits;
    if (phi > budget) break;
    const level = levelOf(evaluateObject(lineType, family, params, { lines: [fromMC(q(m.n), q(c.n))] }, variant, tieBreaker).score, ladder);
    if (phi < best[level]! - 1e-9) { best[level] = phi; count[level] = 1; } else if (Math.abs(phi - best[level]!) < 1e-9) count[level]!++;
  }
  // Upper sets: the cheapest line at or above each level.
  const out = new Array<number>(ladder.length).fill(Infinity);
  let b = Infinity, n = 0;
  for (let k = ladder.length - 1; k >= 0; k--) {
    if (best[k]! < b - 1e-9) { b = best[k]!; n = count[k]!; } else if (Math.abs(best[k]! - b) < 1e-9) n += count[k]!;
    out[k] = b - Math.log2(n);
  }
  const base = out[0]!;
  return out.map(v => v - base);
}
