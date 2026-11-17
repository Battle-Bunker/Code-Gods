/**
 * Two more lenses on a line (the owner, 17 Nov: "a fractal space of values where there are multiple directions to go
 * towards greater complexity"; no privileged lens). Each is a view of the same line in lowest terms; a case a lens
 * cannot read refuses the pin. Wired into the game's lens list (lens-moves.ts) once its turn law takes lenses whose
 * length changes (the coordinator, 17 Nov); until then these are the lens modules and their tests.
 *
 * - The CONTINUED-FRACTION lens ("cf"): the gradient and the y-intercept each as [a0; a1, a2, …] (a0 any whole number,
 *   the rest ≥ 1, the last ≥ 2 when there is more than one: the canonical form). Mutations: add k to a coefficient,
 *   append a coefficient, drop the last. A step in the tree of fractions is one small move. Its length changes; a turn's
 *   surprise pads the shorter side with 0 (a coefficient that appears rises from 0; one that disappears falls to 0),
 *   aligned from the front of each parameter.
 * - The PRIME-EXPONENT lens ("pe"): each of the four whole numbers (gradient top and bottom, y-intercept top and bottom)
 *   as its exponents of 2, 3, 5, 7, 11, 13 and a leftover cofactor sharing none of them (the top's sign on its cofactor).
 *   Adding 1 to an exponent multiplies by that prime: multiplying becomes adding. 28 whole numbers, fixed length.
 */
import { gcd, q, type Q } from "@workspace/v2-core";

import { fromMC, isVertical, normalise, type Line } from "./line.ts";

const babs = (x: bigint) => (x < 0n ? -x : x);
const floorDiv = (a: bigint, b: bigint): bigint => { const d = a / b; return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? d - 1n : d; };

// ------------------------------------------------------------------ continued fractions

/** The canonical continued fraction of x: a0 = ⌊x⌋, then ≥ 1, the last ≥ 2 when there is more than one (at most 400). */
export function continuedOf(x: Q): bigint[] {
  let n = x.n, d = x.d;
  const out: bigint[] = [];
  while (d !== 0n && out.length < 400) { const a = floorDiv(n, d); out.push(a); [n, d] = [d, n - a * d]; }
  return out;
}
/** The value of [a0; a1, …], or null when it is not a number (an empty list, a later coefficient below 1, a zero to divide by). */
export function valueOf(as: readonly bigint[]): Q | null {
  if (!as.length) return null;
  for (let i = 1; i < as.length; i++) if (as[i]! < 1n) return null;
  let n = as[as.length - 1]!, d = 1n;
  for (let i = as.length - 2; i >= 0; i--) { if (n === 0n) return null; [n, d] = [as[i]! * n + d, n]; }
  return d === 0n ? null : q(n, d);
}
export interface CfNumbers { readonly m: readonly bigint[]; readonly c: readonly bigint[] }
export const cfLens = {
  id: "cf" as const,
  title: "continued fractions: gradient [a0; a1, …] and y-intercept [b0; b1, …]",
  read(l: Line): CfNumbers | null {
    if (isVertical(l)) return null;
    return { m: continuedOf(q(-l.a, l.b)), c: continuedOf(q(-l.c, l.b)) };
  },
  build(ns: CfNumbers): Line | null {
    const m = valueOf(ns.m), c = valueOf(ns.c);
    return m && c ? fromMC(m, c) : null;
  },
};
export type CfMove = { readonly kind: "add"; readonly which: "m" | "c"; readonly at: number; readonly k: bigint }
  | { readonly kind: "append"; readonly which: "m" | "c"; readonly k: bigint }
  | { readonly kind: "drop"; readonly which: "m" | "c" };
/** One continued-fraction mutation, or null when it leaves no number (a later coefficient below 1, the last dropped). */
export function cfMutate(ns: CfNumbers, mv: CfMove): CfNumbers | null {
  const list = [...ns[mv.which]];
  if (mv.kind === "add") { if (mv.at < 0 || mv.at >= list.length || mv.k === 0n) return null; list[mv.at] = list[mv.at]! + mv.k; }
  else if (mv.kind === "append") { if (mv.k < 1n) return null; list.push(mv.k); }
  else { if (list.length < 2) return null; list.pop(); }
  if (!valueOf(list)) return null;
  return { ...ns, [mv.which]: list };
}
/** Before and after as two lists of equal length for a turn's surprise: each parameter aligned from its front, padded with 0. */
export function cfAligned(before: CfNumbers, after: CfNumbers): [bigint[], bigint[]] {
  const b: bigint[] = [], a: bigint[] = [];
  for (const k of ["m", "c"] as const) {
    const L = Math.max(before[k].length, after[k].length);
    for (let i = 0; i < L; i++) { b.push(before[k][i] ?? 0n); a.push(after[k][i] ?? 0n); }
  }
  return [b, a];
}

// ------------------------------------------------------------------ prime exponents

export const PE_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n] as const;
const PER = PE_PRIMES.length + 1;
const PARTS = ["gradient top", "gradient bottom", "y-intercept top", "y-intercept bottom"] as const;
/** Exponents of 2 … 13 and the cofactor of a whole number (0: all 0; the sign on the cofactor). */
export function exponentsOf(n: bigint): bigint[] {
  if (n === 0n) return [...PE_PRIMES.map(() => 0n), 0n];
  let x = babs(n);
  const es = PE_PRIMES.map(p => { let e = 0n; while (x % p === 0n) { x /= p; e++; } return e; });
  return [...es, n < 0n ? -x : x];
}
/** The whole number from its exponents and cofactor, or null (a negative exponent; a cofactor sharing a listed prime is fine: it is read back canonically). */
export function fromExponents(ns: readonly bigint[]): bigint | null {
  let x = ns[PER - 1]!;
  for (let i = 0; i < PE_PRIMES.length; i++) { if (ns[i]! < 0n) return null; x *= PE_PRIMES[i]! ** ns[i]!; }
  return x;
}
export const peLens = {
  id: "pe" as const,
  title: "prime exponents: each top and bottom as powers of 2, 3, 5, 7, 11, 13 times what is left",
  numbers: PARTS.flatMap(part => [...PE_PRIMES.map(p => `${part}: exponent of ${p}`), `${part}: what is left`]),
  read(l: Line): bigint[] | null {
    if (isVertical(l)) return null;
    const m = q(-l.a, l.b), c = q(-l.c, l.b);
    return [m.n, m.d, c.n, c.d].flatMap(exponentsOf);
  },
  build(ns: readonly bigint[]): Line | null {
    if (ns.length !== 4 * PER) return null;
    const v = [0, 1, 2, 3].map(i => fromExponents(ns.slice(i * PER, (i + 1) * PER)));
    if (v.some(x => x === null) || v[1]! <= 0n || v[3]! <= 0n) return null;   // bottoms stay 1 or more
    const l = normalise(-v[0]! * v[3]!, v[1]! * v[3]!, -v[2]! * v[1]!);
    return "invalid" in l || isVertical(l) ? null : l;
  },
};

// ------------------------------------------------------------------ "add the rational p/q", as whole-number mutations

/** One whole-number mutation on a parameter's top or bottom (the mc lens's add and multiply). */
export interface PairStep { readonly kind: "mul" | "add"; readonly on: "top" | "bottom"; readonly k: bigint }
/**
 * Adding p/q to top/bottom, expanded into the whole-number mutations it is priced as: multiply the bottom by the factor
 * that makes it a common bottom, then add to the top (the owner's example: 1/2 + 1/3 is multiply the bottom by 3, then
 * add 4 to the top, giving 5/6). The result is read back in lowest terms.
 */
export function expandAdd(top: bigint, bottom: bigint, p: bigint, qq: bigint): PairStep[] {
  if (bottom <= 0n || qq <= 0n) throw new RangeError("bottoms are 1 or more");
  const L = (bottom / gcd(bottom, qq)) * qq, f = L / bottom, k = top * f + p * (L / qq) - top;
  const out: PairStep[] = [];
  if (f > 1n) out.push({ kind: "mul", on: "bottom", k: f });
  if (k !== 0n) out.push({ kind: "add", on: "top", k });
  return out;
}
/** The pair after the steps, in lowest terms. */
export function applySteps(top: bigint, bottom: bigint, steps: readonly PairStep[]): Q {
  for (const s of steps) {
    if (s.kind === "mul") { if (s.on === "top") top *= s.k; else bottom *= s.k; }
    else if (s.on === "top") top += s.k; else bottom += s.k;
  }
  return q(top, bottom);
}
