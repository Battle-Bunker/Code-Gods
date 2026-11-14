/**
 * The uniqueness correction (owner decision 24, spec §2.6). Within a game no two objects hold the same state, so the
 * law of a game with N objects is the product law restricted to distinct tuples, and one object's marginal is π(x)
 * times the chance the other N − 1 avoid x. A rare state is almost never held by another object, so its mass rises by
 * 1/(1 − E[M_N]), M_N being the π-mass the others hold; common states are crowded out. Values are computed under the
 * one-object law (value.ts), and this correction lowers the bits of rare scores by
 *
 *   shift(N) = log2 (1 / (1 − E[M_N]))
 *
 * ramped in from the crowded region (bits ≈ log2 N) over a width at least twice the shift, so the corrected value stays
 * monotone in the score. E[M_N] comes from a Gibbs sampler of the restricted law (each sweep redraws every object from
 * π conditioned on differing from the others), tabulated per variant by `pnpm --filter @workspace/v2-valuation
 * uniqueness`. Provisional: the ramp is an approximation of the per-state factor between the crowded and rare regions.
 */
import { rng, type Rng, type Score, type Variant } from "@workspace/v2-core";
import { lineLaw, lineType } from "@workspace/v2-linear";
import { cellProbability, gridParams } from "@workspace/v2-grid";
import type { Lookup } from "./value.ts";

export interface UniquenessTable {
  readonly variant: string;
  /** Σ_x π(x)²: the chance two independent objects coincide. */
  readonly collision: number;
  /** Object counts, ascending, and E[M_N] at each (the π-mass held by the other N − 1 objects). */
  readonly ns: readonly number[];
  readonly heldMass: readonly number[];
  readonly sweeps: number;
}

/** A draw from π: the state's key and its π-mass (null: refused, draw again). */
type Draw = () => { key: string; mass: number } | null;

function lineDraw(variant: Variant, r: Rng): { draw: Draw; mass: (bits: number) => number } {
  const law = lineLaw(variant);
  // P(a draw is a canonical state): π(x) = 2^−φ(x) / P(canonical), estimated once from 200,000 draws.
  let ok = 0;
  for (let i = 0; i < 200_000; i++) if (law.draw(r, 1).state) ok++;
  const canon = ok / 200_000;
  return {
    draw: () => { const d = law.draw(r, 1); return d.state ? { key: lineType.encode(d.state), mass: 2 ** -d.bits / canon } : null; },
    mass: bits => 2 ** -bits / canon,
  };
}

function gridDraw(variant: Variant, r: Rng): Draw {
  const { size, cap } = gridParams(variant);
  const p = Array.from({ length: cap + 1 }, (_, v) => cellProbability(v, variant));
  return () => {
    const cells: number[] = [];
    let mass = 1;
    for (let i = 0; i < size * size; i++) {
      let u = r.unit(), v = 0;
      while (v < cap && u >= p[v]!) { u -= p[v]!; v++; }
      cells.push(v); mass *= p[v]!;
    }
    return { key: cells.join(","), mass };
  };
}

/** E[M_N] for each N by Gibbs sampling, and Σπ² by direct draws. */
export function uniquenessTable(variant: Variant, kind: "line" | "grid", ns: readonly number[], sweeps = 60, seed = "uniqueness"): UniquenessTable {
  const r = rng(seed, variant.id);
  const draw: Draw = kind === "line" ? lineDraw(variant, r).draw : gridDraw(variant, r);
  const next = () => { let d; do { d = draw(); } while (d === null); return d; };
  let collision = 0;
  for (let i = 0; i < 200_000; i++) collision += next().mass / 200_000;   // E_π[π(x)] = Σ π²
  const heldMass = ns.map(N => {
    const objs: { key: string; mass: number }[] = [];
    const held = new Set<string>();
    while (objs.length < N) { const d = next(); if (!held.has(d.key)) { held.add(d.key); objs.push(d); } }
    let sum = 0, count = 0;
    const burn = Math.min(10, Math.floor(sweeps / 4));
    for (let s = 0; s < sweeps; s++) {
      for (let i = 0; i < N; i++) {
        held.delete(objs[i]!.key);
        let d; do { d = next(); } while (held.has(d.key));
        objs[i] = d; held.add(d.key);
      }
      if (s >= burn) {
        // Each object's view: the mass the other N − 1 hold, averaged over objects.
        const total = objs.reduce((a, o) => a + o.mass, 0);
        sum += objs.reduce((a, o) => a + (total - o.mass), 0) / N;
        count++;
      }
    }
    return Math.min(0.999, sum / count);
  });
  return { variant: variant.id, collision, ns, heldMass, sweeps };
}

/** The bits shift for rare scores in a game of N objects (0 for one object), interpolated in log N. */
export function uniquenessShift(table: Pick<UniquenessTable, "ns" | "heldMass">, objects: number): number {
  if (objects <= 1) return 0;
  const { ns, heldMass } = table;
  let m: number;
  if (objects <= ns[0]!) m = heldMass[0]! * (objects - 1) / Math.max(1, ns[0]! - 1);
  else if (objects >= ns[ns.length - 1]!) m = heldMass[heldMass.length - 1]!;
  else {
    const i = ns.findIndex(n => n >= objects);
    const t = (Math.log(objects) - Math.log(ns[i - 1]!)) / (Math.log(ns[i]!) - Math.log(ns[i - 1]!));
    m = heldMass[i - 1]! + t * (heldMass[i]! - heldMass[i - 1]!);
  }
  return Math.log2(1 / (1 - m));
}

/**
 * A lookup corrected for a game of N objects: bits b become b − shift·ramp(b), the ramp rising from 0 at log2 N over
 * max(2, 2·shift) bits, so the correction is monotone (slope ≥ ½) and leaves the crowded region alone. Bounds move
 * the same way (a monotone map keeps them ordered).
 */
export function withUniqueness(look: (u: Score) => Lookup, table: Pick<UniquenessTable, "ns" | "heldMass">, objects: number): (u: Score) => Lookup {
  const shift = uniquenessShift(table, objects);
  if (shift <= 0) return look;
  const b0 = Math.log2(objects), width = Math.max(2, 2 * shift);
  const map = (b: number) => (Number.isFinite(b) ? Math.max(0, b - shift * Math.min(1, Math.max(0, (b - b0) / width))) : b);
  return u => { const v = look(u); return { ...v, bits: map(v.bits), lo: map(v.lo), hi: map(v.hi) }; };
}
