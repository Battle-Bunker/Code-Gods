import { isInvalid, type Variant } from "@workspace/v2-core";
import { fromMC, normalise, type Line } from "@workspace/v2-linear";
import { q, type Q } from "@workspace/v2-core";
import { canonicalPair, pairQ, type PairState } from "../src/index.ts";

/** a·x + b·y + c = 0, canonical. */
export const L = (a: number, b: number, c: number): Line => normalise(BigInt(a), BigInt(b), BigInt(c)) as Line;
/** y = m·x + c. */
export const Y = (m: Q | number, c: Q | number): Line => fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c);
export function sys(l1: Line, l2: Line, v: Variant = pairQ): PairState {
  const s = canonicalPair([l1, l2], v);
  if (isInvalid(s)) throw new Error(s.invalid);
  return s;
}
