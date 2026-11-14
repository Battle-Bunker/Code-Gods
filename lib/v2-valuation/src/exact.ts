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
import { compareScores, evaluateObject, mixedIntBits, objectLadder, levelOf, q, ruleLayers, toWireQ, type Q, type RuleFamily, type TieBreaker, type Variant } from "@workspace/v2-core";

/** Compares two score components (null ranks last), as compareScores does. */
const compareComponent = (a: Q | null, b: Q): number => compareScores([a], [b]);
import { fromMC, lineParams, lineSums, lineType, type Band, type LineState, type LineSums } from "@workspace/v2-linear";

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

// ---------------------------------------------------------------- the valuation's entry point (owner decision 19)

/** Budgets: the 1D enumeration for separable laws and band sums, and the 2D one for the generic fallback. */
export interface ExactConfig { readonly separableBits: number; readonly bandBits: number; readonly triangleBits: number; readonly wideRange: number }
export const EXACT_CONFIG: ExactConfig = { separableBits: 44, bandBits: 40, triangleBits: 28, wideRange: 200 };

export interface ExactLadder {
  /** Per rung, the certified interval of V_k in bits. */
  readonly lo: readonly number[];
  readonly hi: readonly number[];
  /** How each rung was summed. */
  readonly method: readonly ("separable" | "band" | "enumeration")[];
}

/** Exact rung values for a rule on one whole-number line per object, by its family's plan (lineSums) or the fallback. */
export function exactLadder<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tieBreaker: TieBreaker, cfg: ExactConfig = EXACT_CONFIG): ExactLadder {
  oneLine(variant);
  const plan = lineSums[family.id] as LineSums<P> | undefined;
  const layers = ruleLayers(family, tieBreaker).map(l => l.id);
  const on = layers.map(id => plan?.separable?.[id]);
  if (on.every(x => x !== undefined)) {
    const r = exactRungsSeparable(family, params, variant, tieBreaker, on as ("m" | "c")[], cfg.separableBits);
    return { lo: r.lo, hi: r.hi, method: r.lo.map(() => "separable") };
  }
  const tri = exactRungs(family, params, variant, tieBreaker, cfg.triangleBits);
  const lo = [...tri.lo], hi = [...tri.hi];
  const method: ("separable" | "band" | "enumeration")[] = lo.map(() => "enumeration");
  for (const band of plan?.bands ?? []) {
    const b = bandRungs(family, params, variant, tieBreaker, band, cfg);
    for (let k = b.from; k < lo.length; k++) {
      if (b.hi[k]! - b.lo[k]! < hi[k]! - lo[k]!) { lo[k] = b.lo[k]!; hi[k] = b.hi[k]!; method[k] = "band"; }
    }
  }
  return { lo, hi, method };
}

/**
 * The band sum: for every m within bandBits, the lines (m, c) with c in the plan's ranges and among the integers within
 * bandBits; every line at main level ≥ fromMain inside that rectangle is among them (the plan's contract). Outside mass:
 * T(m) + T(c) for the coefficients beyond the budget, plus the mass of any range too wide to enumerate (added, not
 * summed: wideRange).
 */
function bandRungs<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tieBreaker: TieBreaker,
  band: Band<P>, cfg: ExactConfig): { from: number; lo: number[]; hi: number[] } {
  const ladder = objectLadder(lineType, family, params, variant, tieBreaker);
  const fromMain = band.fromMain(params);
  const from = ladder.findIndex(r => r.layer === 0 && r.main === fromMain);
  if (from < 0) throw new Error(`${family.id}: the band starts at main level ${fromMain}, which the ladder does not have`);
  const ints = integersWithin(cfg.bandBits);
  const byValue = [...ints].sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
  const prefix = [0];
  for (const x of byValue) prefix.push(prefix[prefix.length - 1]! + 2 ** -x.bits);
  const T1 = Math.max(0, 1 - prefix[prefix.length - 1]!);
  const lower = (v: bigint) => { let a = 0, b = byValue.length; while (a < b) { const h = (a + b) >> 1; if (byValue[h]!.n < v) a = h + 1; else b = h; } return a; };
  const mass = new Array<number>(ladder.length).fill(0);
  let slack = 0, pointMass = 0;
  // mixedInt is completely multiplicative past its constant: bits(t·k) = bits(t) + bits(k) − bits(1) for k ≠ 0, so the
  // multiples of t within the budget are t·k for the k cheapest first, stopping at the budget.
  const one = mixedIntBits(1n);
  const add = (pm: number, c: bigint, bits: number, mN: bigint) => {
    const score = evaluateObject(lineType, family, params, { lines: [fromMC(q(mN), q(c))] }, variant, tieBreaker).score;
    mass[levelOf(score, ladder)]! += pm * 2 ** -bits;
  };
  if (band.points === "same") for (const r of band.ranges(0n, params)) pointMass += 2 ** -mixedIntBits(r.lo);
  if (band.points === "one-per-m") pointMass = 2 ** -Math.min(...ints.map(x => x.bits));   // the most any one c can weigh
  for (const m of ints) {
    const pm = 2 ** -m.bits;
    const seen = new Set<bigint>();
    for (const r of band.ranges(m.n, params)) {
      if (band.points) {
        // A point, evaluated whatever its size (its mass is in pointMass).
        if (!seen.has(r.lo)) { seen.add(r.lo); add(pm, r.lo, mixedIntBits(r.lo), m.n); }
        continue;
      }
      if (r.step) {
        const tBits = mixedIntBits(r.step);
        for (const k of ints) {
          const bits = k.n === 0n ? mixedIntBits(0n) : tBits + k.bits - one;
          if (k.n !== 0n && tBits + k.bits - one > cfg.bandBits) { if (k.bits > cfg.bandBits - tBits + one) break; continue; }
          const c = r.step * k.n;
          if (c < r.lo || c > r.hi || seen.has(c)) continue;
          seen.add(c);
          add(pm, c, bits, m.n);
        }
        continue;
      }
      const i0 = lower(r.lo), i1 = lower(r.hi + 1n);
      if (i1 - i0 > cfg.wideRange) { slack += pm * (prefix[i1]! - prefix[i0]!); continue; }
      for (let i = i0; i < i1; i++) {
        const c = byValue[i]!;
        if (seen.has(c.n)) continue;
        seen.add(c.n);
        add(pm, c.n, c.bits, m.n);
      }
    }
  }
  // Outside the enumeration: m beyond the budget (T1, times the most one m's points can weigh when the c values are
  // points, all of which were summed), c beyond it (T1), and the wide ranges' mass.
  const out = band.points ? T1 * pointMass : 2 * T1 + slack;
  const lo: number[] = [], hi: number[] = [];
  let acc = 0;
  for (let k = ladder.length - 1; k >= 0; k--) {
    acc += mass[k]!;
    lo[k] = k === 0 ? 0 : -Math.log2(Math.min(1, acc + out));
    hi[k] = k === 0 ? 0 : -Math.log2(acc);
  }
  return { from, lo, hi };
}

/** Distinct values each dealt layer takes among every line with φ(m) + φ(c) ≤ budget (the continuity check, decision 13). */
export function distinctLayerValues<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tieBreaker: TieBreaker, budget: number): number[] {
  const ints = integersWithin(budget);
  const layers = ruleLayers(family, tieBreaker).length;
  const seen = Array.from({ length: layers }, () => new Set<string>());
  for (const m of ints) for (const c of ints) {
    if (m.bits + c.bits > budget) break;
    const s = evaluateObject(lineType, family, params, { lines: [fromMC(q(m.n), q(c.n))] }, variant, tieBreaker).score;
    if (s === null) continue;
    for (let j = 0; j < layers; j++) seen[j]!.add(s[j] === null || s[j] === undefined ? "undefined" : toWireQ(s[j]!));
  }
  return seen.map(x => x.size);
}
